// Execute the real TS/TSX modules with controlled hook/bridge doubles.
// These tests check request ordering, not native rendering or FCM delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(setImmediate);
function moduleAt(path, mocks, globals = {}) {
  const source = process.env.AUDIT_SOURCE_REF
    ? execFileSync('git', ['show', `${process.env.AUDIT_SOURCE_REF}:${path}`], { cwd: root, encoding: 'utf8' })
    : readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in mocks)) throw Error(`Missing test module ${name}`);
    return mocks[name];
  }, console, setTimeout, clearTimeout, AbortController, URL, ...globals });
  return exports;
}
function screenHarness(params, api) {
  const focusCleanups = [], mountCleanups = [], updates = [], callbacks = [];
  return {
    updates, callbacks,
    blur: () => focusCleanups.forEach(fn => fn?.()),
    mocks: {
      react: {
        useState: value => [value, value => updates.push(value)],
        useCallback: fn => { callbacks.push(fn); return fn; }, useMemo: fn => fn(), useRef: value => ({ current: value }),
        useEffect: fn => mountCleanups.push(fn()),
      },
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'react-native': { StyleSheet: { create: x => x }, Linking: {}, Pressable: 'P', View: 'V', Text: 'T', ActivityIndicator: 'A' },
      'expo-router': { useLocalSearchParams: () => params, useRouter: () => ({}),
        useFocusEffect: fn => focusCleanups.push(fn()) },
      '@/components/screen-shell': { ScreenShell: 'Shell' },
      '@/components/quote-row': { QuoteRow: 'Quote' },
      '@/components/section-title': { SectionTitle: 'Section' },
      '@/constants/market-theme': { palette: {}, spacing: {} },
      '@/lib/market-api': api,
    },
  };
}
for (const kind of ['report', 'stock']) {
  test(`${kind} request resolving after blur does not write activity or state`, async () => {
    const pending = deferred(); const records = [];
    const api = {
      getReport: () => pending.promise, markReportRead: id => records.push(id),
      getStockDetail: () => pending.promise, recordStockView: item => records.push(item),
    };
    const h = screenHarness({ id: 'a', market: 'KR', code: '005930' }, api);
    moduleAt(kind === 'report' ? 'mobile/src/app/report/[id].tsx' : 'mobile/src/app/stock/[market]/[code].tsx', h.mocks).default();
    h.blur(); // Stack screens can lose focus while remaining mounted.
    pending.resolve(kind === 'report' ? { id: 'a' } : { quote: { name: 'Samsung' } });
    await flush();
    assert.equal(records.length, 0);
    assert.equal(h.updates.length, 0);
  });
}

test('external HTTPS PDF never requests an API key; internal PDF requests a signed link', async () => {
  const calls = [];
  const api = moduleAt('mobile/src/lib/market-api.ts', { '@/data/sample-data': {} }, {
    process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://app.example', EXPO_PUBLIC_API_KEY: 'private-app-key' } },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ url: '/api/reports/a/pdf?signature=abc' }) }; },
  });
  assert.equal(await api.getReportPdfUrl('a', 'https://other.example/file.pdf'), 'https://other.example/file.pdf');
  assert.equal(calls.length, 0);
  assert.equal(await api.getReportPdfUrl('a', '/api/reports/a/pdf'), 'https://app.example/api/reports/a/pdf?signature=abc');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://app.example/api/reports/a/pdf-link');
});

test('live notification wins over delayed cold-start and duplicate IDs navigate once', async () => {
  const pending = deferred(); const navigations = []; let listener;
  const response = id => ({ notification: { request: { identifier: id, content: { data: { screen: 'movers' } } } } });
  const hook = moduleAt('mobile/src/hooks/use-push-notifications.ts', {
    react: { useRef: x => ({ current: x }), useEffect: fn => fn() },
    'react-native': { Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'expo-constants': { default: {} },
    'expo-router': { useRouter: () => ({ push: x => navigations.push(x) }) },
    '@/lib/market-api': { registerPushToken: async () => {} },
    'expo-notifications': {
      setNotificationHandler() {},
      addNotificationResponseReceivedListener: fn => { listener = fn; return { remove() {} }; },
      getLastNotificationResponseAsync: () => pending.promise,
      clearLastNotificationResponseAsync: async () => {},
    },
  }, {
    process: { env: { EXPO_PUBLIC_SURGE_ALERTS_ENABLED: 'true' } },
  });
  hook.usePushNotifications();
  listener(response('live')); listener(response('live'));
  pending.resolve(response('old'));
  await flush();
  assert.equal(navigations.length, 1);
});

for (const screen of ['index', 'watchlist']) {
  test(`${screen} overlapping loads discard the older response`, async () => {
    const old = deferred(), latest = deferred(); let count = 0;
    const load = () => (++count === 1 ? old.promise : latest.promise);
    const h = screenHarness({}, { getHomeBriefing: load, getWatchlistItems: load,
      isLiveDataConfigured: () => true, isDemoMode: () => false });
    moduleAt(`mobile/src/app/(tabs)/${screen}.tsx`, h.mocks).default();
    const second = h.callbacks[0]();
    const oldItems = [], latestItems = [];
    const result = items => screen === 'watchlist' ? items : {
      focusStocks: items, reports: [], alertRule: {}, engagement: {}, weeklyReview: null,
      calendar: [], generatedAt: new Date().toISOString(),
    };
    latest.resolve(result(latestItems)); await second;
    old.resolve(result(oldItems)); await flush();
    assert.ok(h.updates.includes(latestItems));
    assert.ok(!h.updates.includes(oldItems));
  });
}
function findNode(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate); if (found) return found;
  }
}
test('settings v1 exposes no surge rule controls', () => {
  const h = screenHarness({}, {
    getAiStatus: async () => null,
    isLiveDataConfigured: () => true,
    isDemoMode: () => false,
  });
  const tree = moduleAt('mobile/src/app/(tabs)/settings.tsx', h.mocks).default();
  const control = findNode(tree, node => typeof node.props?.onSelect === 'function');
  assert.equal(control, undefined);
});
test('search responses arriving backwards preserve the newer result', async () => {
  const old = deferred(), latest = deferred(); let count = 0, stateIndex = 0;
  const h = screenHarness({}, { getWatchlistItems: async () => [],
    searchStocks: () => (++count === 1 ? old.promise : latest.promise) });
  const state = h.mocks.react.useState;
  h.mocks.react.useState = initial => state(stateIndex++ === 1 ? 'NVDA' : initial);
  const tree = moduleAt('mobile/src/app/(tabs)/watchlist.tsx', h.mocks).default();
  const input = findNode(tree, node => typeof node.props?.onSubmitEditing === 'function');
  const first = input.props.onSubmitEditing(), second = input.props.onSubmitEditing();
  const oldItems = ['old'], latestItems = ['new'];
  latest.resolve(latestItems); await second;
  old.resolve(oldItems); await first;
  assert.ok(h.updates.includes(latestItems));
  assert.ok(!h.updates.includes(oldItems));
});


test('GET API retries a single Railway cold-start gateway failure', async () => {
  let calls = 0;
  const immediateTimers = [];
  const api = moduleAt('mobile/src/lib/market-api.ts', {
    '@/data/sample-data': {
      sampleMovers: [],
      sampleReports: [],
      sampleWatchlist: [],
    },
  }, {
    process: {
      env: {
        EXPO_PUBLIC_API_BASE_URL: 'https://app.example',
        EXPO_PUBLIC_API_KEY: 'key',
      },
    },
    fetch: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 502, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: false,
          model: 'gpt-5.6-terra',
          callsToday: 0,
          dailyLimit: 0,
        }),
      };
    },
    setTimeout: (fn, ms) => {
      if (ms === 1000) {
        immediateTimers.push(Promise.resolve().then(fn));
      }
      return 1;
    },
    clearTimeout: () => {},
  });

  const result = await api.getAiStatus();
  await Promise.all(immediateTimers);
  assert.equal(calls, 2);
  assert.equal(result.enabled, false);
});
