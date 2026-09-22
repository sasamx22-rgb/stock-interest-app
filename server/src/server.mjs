import { readBinaryBody, readJsonBody } from './http-body.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { AiBudgetStore } from './ai-budget-store.mjs';
import { AlertSettingsStore } from './alert-settings-store.mjs';
import { CalendarEventStore } from './calendar-event-store.mjs';
import { describeAlert, isAlertEligible } from './alerts.mjs';
import { config } from './config.mjs';
import { buildDailyPicks } from './daily-picks.mjs';
import { EconomicCalendarProvider } from './economic-calendar-provider.mjs';
import { buildEngagementSummary, buildWeeklyReview } from './engagement-service.mjs';
import { EngagementStore } from './engagement-store.mjs';
import { withFileLock } from './file-storage.mjs';
import { getExpoPushReceipts, sendExpoPushNotifications } from './expo-push.mjs';
import { NaverMarketProvider } from './naver-provider.mjs';
import { OpenAiAnalysisService } from './openai-analysis.mjs';
import { PushReceiptMonitor } from './push-receipt-monitor.mjs';
import { PushReceiptStore } from './push-receipt-store.mjs';
import { PushTokenStore } from './push-token-store.mjs';
import { ReportPdfStore } from './report-pdf-store.mjs';
import { ReportStore } from './report-store.mjs';
import { sampleReports } from './sample.mjs';
import { SurgePushMonitor } from './surge-push-monitor.mjs';
import { buildTodayFocus } from './today-focus.mjs';
import { WatchlistStore } from './watchlist-store.mjs';

if (process.env.NODE_ENV === 'production' && !config.apiKey) {
  throw new Error('MARKET_PULSE_API_KEY is required in production');
}
if (process.env.NODE_ENV === 'production' && (!config.publishKey || config.publishKey === config.apiKey)) {
  throw new Error('A distinct MARKET_PULSE_PUBLISH_KEY is required in production');
}

const provider = new NaverMarketProvider();
const calendarProvider = new EconomicCalendarProvider();

const aiBudgetStore = new AiBudgetStore({
  filePath: join(config.dataDir, 'ai-budget.json'),
  dailyLimit: config.ai.dailyLimit,
});

const aiService = new OpenAiAnalysisService({
  apiKey: config.ai.apiKey,
  model: config.ai.model,
  budgetStore: aiBudgetStore,
});

const alertSettingsStore = new AlertSettingsStore({
  filePath: join(config.dataDir, 'alert-settings.json'),
});

const watchlistStore = new WatchlistStore({
  filePath: join(config.dataDir, 'watchlist.json'),
  defaults: config.watchlist,
});

const pushTokenStore = new PushTokenStore({
  filePath: join(config.dataDir, 'push-tokens.json'),
});

const pushReceiptStore = new PushReceiptStore({
  filePath: join(config.dataDir, 'push-receipts.json'),
});

const reportStore = new ReportStore({
  filePath: join(config.dataDir, 'reports.json'),
  defaults: process.env.NODE_ENV === 'production' ? [] : sampleReports,
});

const reportPdfStore = new ReportPdfStore({
  directory: join(config.dataDir, 'report-pdfs'),
});

const calendarEventStore = new CalendarEventStore({
  filePath: join(config.dataDir, 'calendar-events.json'),
});

const engagementStore = new EngagementStore({
  filePath: join(config.dataDir, 'engagement.json'),
});

const apiRateBuckets = new Map();
const API_RATE_LIMIT = 240;
const API_RATE_WINDOW_MS = 60_000;

function requireApiAccess(request) {
  if (!config.apiKey) return;

  const provided = request.headers['x-market-pulse-key'];
  if (provided !== config.apiKey && provided !== config.publishKey) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

function requireWriteAccess(request) {
  requireApiAccess(request);
}

function requirePublishAccess(request) {
  if (!config.publishKey) {
    if (!config.apiKey) return; // Explicit local, unauthenticated development mode.
    const error = new Error('Publisher access is not configured');
    error.statusCode = 503;
    throw error;
  }
  const provided = request.headers['x-market-pulse-key'];
  if (provided !== config.publishKey) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

function requestIdentity(request) {
  // No verified proxy trust boundary is configured. Do not trust caller-supplied XFF.
  return request.socket?.remoteAddress || 'unknown';
}

function enforceApiRateLimit(request) {
  const now = Date.now();
  const key = requestIdentity(request);
  for (const [bucketKey, bucket] of apiRateBuckets) {
    if (now - bucket.startedAt >= API_RATE_WINDOW_MS) apiRateBuckets.delete(bucketKey);
  }
  const current = apiRateBuckets.get(key);
  if (!current || now - current.startedAt >= API_RATE_WINDOW_MS) {
    if (apiRateBuckets.size >= 500) {
      const error = new Error('Too many clients');
      error.statusCode = 429;
      throw error;
    }
    apiRateBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > API_RATE_LIMIT) {
    const error = new Error('Too many requests');
    error.statusCode = 429;
    throw error;
  }

}

function signPdfAccess(id, expiresAt) {
  return createHmac('sha256', config.apiKey).update(`${id}:${expiresAt}`).digest('hex');
}

function isValidPdfSignature(id, url) {
  if (!config.apiKey) return false;
  const expiresAt = Number(url.searchParams.get('expires'));
  const provided = url.searchParams.get('signature') ?? '';
  if (!Number.isInteger(expiresAt) || expiresAt < Date.now() || expiresAt > Date.now() + 10 * 60_000) return false;
  const expected = signPdfAccess(id, expiresAt);
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function signedPdfRequestAllowed(request, url) {
  if (request.method !== 'GET' || !url.pathname.startsWith('/api/reports/') || !url.pathname.endsWith('/pdf')) return false;
  const encodedId = url.pathname.slice('/api/reports/'.length, -'/pdf'.length);
  const id = decodeURIComponent(encodedId);
  return Boolean(id && !id.includes('/') && isValidPdfSignature(id, url));
}

function reportOperationKey(id) {
  const safe = String(id ?? 'invalid').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'invalid';
  return join(config.dataDir, 'report-operations', `${safe}.lock`);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function loadMarketMovers(markets) {
  const quotes = (await Promise.all(
    markets.map((value) => provider.movers(value, config.moverUrls[value])),
  )).flat();

  const rule = await alertSettingsStore.get();
  const enrichedQuotes = await provider.enrichVolumeRatios(quotes, rule);

  return enrichedQuotes.map((quote) => ({
    ...quote,
    alertEligible: isAlertEligible(quote, rule),
    reason: describeAlert(quote, rule),
  }));
}

async function loadEligibleAlerts() {
  const movers = await loadMarketMovers(['KR', 'US']);
  return movers
    .filter((item) => item.alertEligible)
    .sort((a, b) => b.changePercent - a.changePercent);
}

async function loadCalendarEvents(days, watchlistItems, now = new Date()) {
  const boundedDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const usSymbols = watchlistItems
    .filter((item) => item.market === 'US')
    .map((item) => item.code.split('.')[0]);

  const [automatic, manualEvents] = await Promise.all([
    calendarProvider.upcoming({ days: boundedDays, symbols: usSymbols, now }),
    calendarEventStore.getAll(),
  ]);

  const start = now.getTime() - 86_400_000;
  const end = now.getTime() + boundedDays * 86_400_000;

  return [...automatic, ...manualEvents]
    .filter((event, index, items) => items.findIndex((candidate) => candidate.id === event.id) === index)
    .filter((event) => {
      const time = Date.parse(event.startsAt);
      return time >= start && time <= end;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

const pushMonitor = new SurgePushMonitor({
  loadAlerts: loadEligibleAlerts,
  getTokens: () => pushTokenStore.getAll(),
  sendPush: async (tokens, alerts) => {
    const result = await sendExpoPushNotifications(tokens, alerts);
    if (result.receiptTickets?.length) await pushReceiptStore.add(result.receiptTickets);
    return result;
  },
  removeToken: (token) => pushTokenStore.remove(token),
  intervalMs: config.pushIntervalMs,
});

const pushReceiptMonitor = new PushReceiptMonitor({
  receiptStore: pushReceiptStore,
  getReceipts: (ids) => getExpoPushReceipts(ids),
  removeToken: (token) => pushTokenStore.remove(token),
});


async function handler(request, response) {

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Market-Pulse-Key',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    return response.end();
  }

  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const signedPdfAccess = signedPdfRequestAllowed(request, url);
    if (url.pathname.startsWith('/api/')) {
      enforceApiRateLimit(request);
      if (!signedPdfAccess) requireApiAccess(request);
    }

    if (url.pathname === '/health') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === '/api/home/briefing') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const now = new Date();
      const [
        watchlistItems,
        reports,
        engagement,
        alertRule,
        movers,
        aiStatus,
      ] = await Promise.all([
        watchlistStore.getAll(),
        reportStore.getAll(),
        engagementStore.get(),
        alertSettingsStore.get(),
        loadMarketMovers(['KR', 'US']),
        aiService.status(),
      ]);

      const [focusStocks, calendarResult] = await Promise.all([
        buildTodayFocus({
          provider,
          watchlistItems,
          reports,
          movers,
          now,
        }),
        loadCalendarEvents(7, watchlistItems, now)
          .then((events) => ({ status: 'ok', events }))
          .catch((error) => {
            console.warn('Calendar data unavailable for home briefing', error);
            return { status: 'unavailable', events: [] };
          }),
      ]);
      const calendarEvents = calendarResult.events;
      const dailyPicks = await buildDailyPicks({
        provider,
        focusStocks,
        calendarEvents,
      });

      return sendJson(response, 200, {
        generatedAt: now.toISOString(),
        focusStocks,
        reports: reports.slice(0, 5),
        engagement: buildEngagementSummary({
          reports,
          engagement,
          focusStocks,
          dailyPicks,
        }),
        weeklyReview: buildWeeklyReview({
          engagement,
          reports,
          watchlistItems,
          now,
        }),
        calendar: calendarEvents.slice(0, 15),
        dataStatus: {
          calendar: calendarResult.status,
        },
        alertRule,
        ai: aiStatus,
      });
    }

    if (url.pathname === '/api/ai/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, await aiService.status());
    }

    if (url.pathname === '/api/engagement/summary') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const [engagement, reports, watchlistItems, movers] = await Promise.all([
        engagementStore.get(),
        reportStore.getAll(),
        watchlistStore.getAll(),
        loadMarketMovers(['KR', 'US']),
      ]);
      const focusStocks = await buildTodayFocus({ provider, watchlistItems, reports, movers });
      return sendJson(response, 200, buildEngagementSummary({ reports, engagement, focusStocks }));
    }

    if (url.pathname === '/api/activity/stock-view') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
      requireWriteAccess(request);
      await engagementStore.logStockView(await readJsonBody(request));
      return sendJson(response, 201, { recorded: true });
    }

    if (url.pathname === '/api/review/weekly') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const [engagement, reports, watchlistItems] = await Promise.all([
        engagementStore.get(),
        reportStore.getAll(),
        watchlistStore.getAll(),
      ]);
      return sendJson(response, 200, buildWeeklyReview({ engagement, reports, watchlistItems }));
    }
    if (url.pathname === '/api/reports') {
      if (request.method === 'GET') {
        return sendJson(response, 200, await reportStore.getAll());
      }

      if (request.method === 'POST') {
        requirePublishAccess(request);
        const payload = await readJsonBody(request, 50_000);
        const report = await withFileLock(reportOperationKey(payload?.id), () => reportStore.upsert(payload));
        return sendJson(response, 201, report);
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname === '/api/reports/read-state') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const [engagement, reports] = await Promise.all([
        engagementStore.get(),
        reportStore.getAll(),
      ]);
      return sendJson(response, 200, buildEngagementSummary({
        reports,
        engagement,
        focusStocks: [],
        dailyPicks: [],
      }));
    }

    if (url.pathname.startsWith('/api/reports/') && url.pathname.endsWith('/read')) {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
      requireWriteAccess(request);
      const encodedId = url.pathname.slice('/api/reports/'.length, -'/read'.length);
      const id = decodeURIComponent(encodedId);
      if (!id || id.includes('/')) return sendJson(response, 404, { error: 'Not found' });
      const report = await reportStore.getById(id);
      if (!report) return sendJson(response, 404, { error: 'Report not found' });
      await engagementStore.markReportRead(id);
      return sendJson(response, 200, { read: true });
    }
    if (url.pathname.startsWith('/api/reports/') && url.pathname.endsWith('/pdf-link')) {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      const encodedId = url.pathname.slice('/api/reports/'.length, -'/pdf-link'.length);
      const id = decodeURIComponent(encodedId);
      if (!id || id.includes('/')) return sendJson(response, 404, { error: 'Not found' });
      const report = await reportStore.getById(id);
      if (!report?.pdfUrl || !(await reportPdfStore.read(id))) {
        return sendJson(response, 404, { error: 'PDF not found' });
      }
      const expires = Date.now() + 5 * 60_000;
      const signature = signPdfAccess(id, expires);
      return sendJson(response, 200, {
        url: `/api/reports/${encodeURIComponent(id)}/pdf?expires=${expires}&signature=${signature}`,
        expiresAt: new Date(expires).toISOString(),
      });
    }

    if (url.pathname.startsWith('/api/reports/') && url.pathname.endsWith('/pdf')) {
      const encodedId = url.pathname.slice('/api/reports/'.length, -'/pdf'.length);
      const id = decodeURIComponent(encodedId);
      if (!id || id.includes('/')) return sendJson(response, 404, { error: 'Not found' });

      if (request.method === 'GET') {
        const bytes = await reportPdfStore.read(id);
        if (!bytes) return sendJson(response, 404, { error: 'PDF not found' });

        response.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'private, max-age=300',
          'Content-Type': 'application/pdf',
          'Content-Length': bytes.length,
          'Content-Disposition': `inline; filename="${id}.pdf"`,
        });
        return response.end(bytes);
      }

      if (request.method === 'POST') {
        requirePublishAccess(request);
        const bytes = await readBinaryBody(request);
        const result = await withFileLock(reportOperationKey(id), async () => {
          const report = await reportStore.getById(id);
          if (!report) {
            const error = new Error('Report not found');
            error.statusCode = 404;
            throw error;
          }
          const saved = await reportPdfStore.save(id, bytes);
          const latest = await reportStore.getById(id);
          const updated = await reportStore.upsert({
            ...latest,
            pdfUrl: `/api/reports/${encodeURIComponent(id)}/pdf`,
          });
          return { report: updated, size: saved.size };
        });
        return sendJson(response, 201, result);
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
        requirePublishAccess(request);
        await withFileLock(reportOperationKey(id), async () => {
          await reportStore.remove(id);
          await reportPdfStore.remove(id);
        });
        return sendJson(response, 200, { removed: true });
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }

    if (url.pathname === '/api/today-focus') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const [watchlistItems, reports, movers] = await Promise.all([
        watchlistStore.getAll(),
        reportStore.getAll(),
        loadMarketMovers(['KR', 'US']),
      ]);

      return sendJson(
        response,
        200,
        await buildTodayFocus({
          provider,
          watchlistItems,
          reports,
          movers,
        }),
      );
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

    if (url.pathname.startsWith('/api/stocks/')) {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const parts = url.pathname.slice('/api/stocks/'.length).split('/').filter(Boolean);
      if (parts.length !== 2) return sendJson(response, 404, { error: 'Not found' });

      const [market, encodedCode] = parts;
      const code = decodeURIComponent(encodedCode);
      const name = url.searchParams.get('name')?.trim() || code;

      if (!['KR', 'US'].includes(market)) {
        return sendJson(response, 400, { error: 'Market must be KR or US' });
      }
      if (market === 'KR' && !/^\d{6}$/.test(code)) {
        return sendJson(response, 400, { error: 'Invalid Korean stock code' });
      }
      if (market === 'US' && !/^[A-Za-z0-9._-]{1,40}$/.test(code)) {
        return sendJson(response, 400, { error: 'Invalid US stock code' });
      }

      const symbol = market === 'US' ? code.split('.')[0] : code;
      const [automaticEvents, manualEvents] = await Promise.all([
        calendarProvider.upcoming({ days: 2, symbols: [symbol] }).catch(() => []),
        calendarEventStore.getAll().catch(() => []),
      ]);
      const now = Date.now();
      const relevantEvents = [...automaticEvents, ...manualEvents]
        .filter((event, index, items) => items.findIndex((candidate) => candidate.id === event.id) === index)
        .filter((event) => {
          const eventTime = Date.parse(event.startsAt);
          if (eventTime < now - 36 * 60 * 60 * 1000 || eventTime > now + 12 * 60 * 60 * 1000) return false;

          if (event.tickers.length === 0) {
            return event.importance === 'high' && ['macro', 'fomc'].includes(event.type);
          }

          const targets = new Set([
            symbol.toLowerCase(),
            code.toLowerCase(),
            name.toLowerCase(),
          ]);
          return event.tickers.some((ticker) => targets.has(String(ticker).toLowerCase()));
        });

      const detail = await provider.stockDetail(code, name, market, relevantEvents);

      const shouldEnhanceWithAi = aiService.enabled && (
        Math.abs(detail.quote.changePercent) >= 2
        || detail.quote.volumeRatio >= 2
        || relevantEvents.length > 0
      );

      if (shouldEnhanceWithAi) {
        try {
          const enhanced = await aiService.enhanceMovementReason({
            quote: detail.quote,
            news: detail.news,
            events: relevantEvents,
            ruleBased: detail.movementReason,
          });
          if (enhanced) {
            detail.movementReason = {
              ...detail.movementReason,
              ...enhanced,
              evidence: detail.movementReason?.evidence ?? [],
              aiEnhanced: true,
              model: config.ai.model,
            };
          }
        } catch (error) {
          console.warn('AI movement analysis failed; using rule-based fallback', error);
        }
      }

      return sendJson(response, 200, detail);
    }

    if (url.pathname === '/api/search') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const query = url.searchParams.get('q')?.trim() ?? '';
      if (!query || query.length > 50) {
        return sendJson(response, 400, { error: 'Search query must be 1-50 characters' });
      }

      return sendJson(response, 200, await provider.searchStocks(query));
    }

    if (url.pathname === '/api/calendar') {
      if (request.method === 'GET') {
        const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 14) || 14, 1), 30);
        const watchlistItems = await watchlistStore.getAll();
        return sendJson(
          response,
          200,
          await loadCalendarEvents(days, watchlistItems),
        );
      }

      if (request.method === 'POST') {
        requirePublishAccess(request);
        const event = await calendarEventStore.upsert(await readJsonBody(request));
        return sendJson(response, 201, event);
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
    }
    if (url.pathname === '/api/settings/alerts') {
      if (request.method === 'GET') {
        return sendJson(response, 200, await alertSettingsStore.get());
      }

      if (request.method === 'POST') {
        requireWriteAccess(request);
        return sendJson(
          response,
          200,
          await alertSettingsStore.update(await readJsonBody(request)),
        );
      }

      return sendJson(response, 405, { error: 'Method not allowed' });
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
  console.log(`Market Pulse API listening on http://0.0.0.0:${server.address().port}`);
  pushMonitor.start();
  pushReceiptMonitor.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    pushMonitor.stop();
    pushReceiptMonitor.stop();
    server.close(() => process.exit(0));
  });
}
