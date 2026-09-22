import { createServer } from 'node:http';
import { join } from 'node:path';

import { describeAlert, isAlertEligible } from './alerts.mjs';
import { config } from './config.mjs';
import { sendExpoPushNotifications } from './expo-push.mjs';
import { NaverMarketProvider } from './naver-provider.mjs';
import { PushTokenStore } from './push-token-store.mjs';
import { ReportStore } from './report-store.mjs';
import { sampleReports } from './sample.mjs';
import { SurgePushMonitor } from './surge-push-monitor.mjs';
import { WatchlistStore } from './watchlist-store.mjs';

const provider = new NaverMarketProvider();

const watchlistStore = new WatchlistStore({
  filePath: join(config.dataDir, 'watchlist.json'),
  defaults: config.watchlist,
});

const pushTokenStore = new PushTokenStore({
  filePath: join(config.dataDir, 'push-tokens.json'),
});

const reportStore = new ReportStore({
  filePath: join(config.dataDir, 'reports.json'),
  defaults: sampleReports,
});

function requireWriteAccess(request) {
  if (!config.apiKey) return;

  const provided = request.headers['x-market-pulse-key'];
  if (provided !== config.apiKey) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request, maxBytes = 10_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
  }

  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

async function loadMarketMovers(markets) {
  const quotes = (await Promise.all(
    markets.map((value) => provider.movers(value, config.moverUrls[value])),
  )).flat();

  return quotes.map((quote) => ({
    ...quote,
    alertEligible: isAlertEligible(quote),
    reason: describeAlert(quote),
  }));
}

async function loadEligibleAlerts() {
  const movers = await loadMarketMovers(['KR', 'US']);
  return movers
    .filter((item) => item.alertEligible)
    .sort((a, b) => b.changePercent - a.changePercent);
}

const pushMonitor = new SurgePushMonitor({
  loadAlerts: loadEligibleAlerts,
  getTokens: () => pushTokenStore.getAll(),
  sendPush: (tokens, alerts) => sendExpoPushNotifications(tokens, alerts),
  removeToken: (token) => pushTokenStore.remove(token),
  intervalMs: config.pushIntervalMs,
});

async function handler(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Market-Pulse-Key',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    return response.end();
  }

  try {
    if (url.pathname === '/health') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const pushTokens = await pushTokenStore.getAll();
      return sendJson(response, 200, {
        ok: true,
        provider: 'naver',
        pushMonitor: pushMonitor.active ? 'active' : 'inactive',
        registeredDevices: pushTokens.length,
      });
    }

    if (url.pathname === '/api/reports') {
      if (request.method === 'GET') {
        return sendJson(response, 200, await reportStore.getAll());
      }

      if (request.method === 'POST') {
        requireWriteAccess(request);
        const report = await reportStore.upsert(await readJsonBody(request, 50_000));
        return sendJson(response, 201, report);
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname.startsWith('/api/reports/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/reports/'.length));
      if (!id || id.includes('/')) return sendJson(response, 404, { error: 'Not found' });

      if (request.method === 'GET') {
        const report = await reportStore.getById(id);
        return report
          ? sendJson(response, 200, report)
          : sendJson(response, 404, { error: 'Report not found' });
      }

      if (request.method === 'DELETE') {
        requireWriteAccess(request);
        await reportStore.remove(id);
        return sendJson(response, 200, { removed: true });
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname === '/api/watchlist/items') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, await watchlistStore.getAll());
    }

    if (url.pathname === '/api/watchlist') {
      if (request.method === 'GET') {
        const items = await watchlistStore.getAll();
        const quotes = await provider.watchlist(items);
        return sendJson(response, 200, quotes);
      }

      if (request.method === 'POST') {
        requireWriteAccess(request);
        const items = await watchlistStore.add(await readJsonBody(request));
        return sendJson(response, 201, items);
      }

      if (request.method === 'DELETE') {
        requireWriteAccess(request);
        const market = url.searchParams.get('market');
        const code = url.searchParams.get('code');
        const items = await watchlistStore.remove(market, code);
        return sendJson(response, 200, items);
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname === '/api/search') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const query = url.searchParams.get('q')?.trim() ?? '';
      if (!query || query.length > 50) {
        return sendJson(response, 400, { error: 'Search query must be 1-50 characters' });
      }

      return sendJson(response, 200, await provider.searchStocks(query));
    }

    if (url.pathname === '/api/push/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const tokens = await pushTokenStore.getAll();
      return sendJson(response, 200, {
        registeredDevices: tokens.length,
        monitorActive: pushMonitor.active,
        intervalSeconds: Math.round(config.pushIntervalMs / 1000),
      });
    }

    if (url.pathname === '/api/push/register') {
      if (request.method === 'POST') {
        requireWriteAccess(request);
        const body = await readJsonBody(request);
        const items = await pushTokenStore.register({
          token: body.token,
          platform: body.platform,
        });
        return sendJson(response, 201, {
          registered: true,
          registeredDevices: items.length,
        });
      }

      if (request.method === 'DELETE') {
        requireWriteAccess(request);
        const token = url.searchParams.get('token');
        const items = await pushTokenStore.remove(token);
        return sendJson(response, 200, {
          registered: false,
          registeredDevices: items.length,
        });
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname === '/api/alerts') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, await loadEligibleAlerts());
    }

    if (url.pathname === '/api/movers') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const market = url.searchParams.get('market');
      const markets = market && ['KR', 'US'].includes(market) ? [market] : ['KR', 'US'];
      return sendJson(response, 200, await loadMarketMovers(markets));
    }

    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    return sendJson(response, Number.isInteger(statusCode) ? statusCode : 502, {
      error: statusCode >= 400 && statusCode < 500 ? error.message : 'Market data provider failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const server = createServer(handler);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Market Pulse API listening on http://0.0.0.0:${config.port}`);
  pushMonitor.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    pushMonitor.stop();
    server.close(() => process.exit(0));
  });
}
