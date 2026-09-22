import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { describeAlert, isAlertEligible } from './alerts.mjs';
import { config } from './config.mjs';
import { NaverMarketProvider } from './naver-provider.mjs';
import { sampleReports } from './sample.mjs';
import { WatchlistStore } from './watchlist-store.mjs';

const provider = new NaverMarketProvider();
const watchlistStore = new WatchlistStore({
  filePath: fileURLToPath(new URL('../data/watchlist.json', import.meta.url)),
  defaults: config.watchlist,
});

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

async function handler(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    });
    return response.end();
  }

  try {
    if (url.pathname === '/health') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, { ok: true, provider: 'naver' });
    }

    if (url.pathname === '/api/reports') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, sampleReports);
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
        const items = await watchlistStore.add(await readJsonBody(request));
        return sendJson(response, 201, items);
      }

      if (request.method === 'DELETE') {
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

    if (url.pathname === '/api/movers') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

      const market = url.searchParams.get('market');
      const markets = market && ['KR', 'US'].includes(market) ? [market] : ['KR', 'US'];
      const quotes = (await Promise.all(
        markets.map((value) => provider.movers(value, config.moverUrls[value])),
      )).flat();
      const movers = quotes.map((quote) => ({
        ...quote,
        alertEligible: isAlertEligible(quote),
        reason: describeAlert(quote),
      }));
      return sendJson(response, 200, movers);
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

createServer(handler).listen(config.port, '0.0.0.0', () => {
  console.log(`Market Pulse API listening on http://0.0.0.0:${config.port}`);
});
