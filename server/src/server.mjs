import { createServer } from 'node:http';

import { describeAlert, isAlertEligible } from './alerts.mjs';
import { config } from './config.mjs';
import { NaverMarketProvider } from './naver-provider.mjs';
import { sampleReports } from './sample.mjs';

const provider = new NaverMarketProvider();

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function handler(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    return response.end();
  }

  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
  if (url.pathname === '/health') return sendJson(response, 200, { ok: true, provider: 'naver' });
  if (url.pathname === '/api/reports') return sendJson(response, 200, sampleReports);

  try {
    if (url.pathname === '/api/watchlist') {
      const quotes = await provider.watchlist(config.watchlist);
      return sendJson(response, 200, quotes);
    }

    if (url.pathname === '/api/movers') {
      const market = url.searchParams.get('market');
      const markets = market && ['KR', 'US'].includes(market) ? [market] : ['KR', 'US'];
      const quotes = (await Promise.all(markets.map((value) => provider.movers(value, config.moverUrls[value])))).flat();
      const movers = quotes.map((quote) => ({
        ...quote,
        alertEligible: isAlertEligible(quote),
        reason: describeAlert(quote),
      }));
      return sendJson(response, 200, movers);
    }

    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(response, 502, {
      error: 'Market data provider failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

createServer(handler).listen(config.port, '0.0.0.0', () => {
  console.log(`Market Pulse API listening on http://0.0.0.0:${config.port}`);
});

