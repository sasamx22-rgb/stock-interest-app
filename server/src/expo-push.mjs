const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_RECEIPTS_PER_REQUEST = 1000;

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function alertBody(alerts) {
  const preview = alerts.slice(0, 3).map(
    (item) => `${String(item.name).slice(0, 80)} +${item.changePercent.toFixed(2)}% · 거래량 ${item.volumeRatio.toFixed(1)}배`,
  );
  if (alerts.length > 3) preview.push(`외 ${alerts.length - 3}개 종목`);
  return preview.join('\n');
}

export async function sendExpoPushNotifications(
  tokens,
  alerts,
  { fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  const validTokens = [...new Set(tokens.filter((token) => typeof token === 'string' && token))];
  if (validTokens.length === 0 || alerts.length === 0) {
    return { sent: 0, invalidTokens: [], tickets: [] };
  }

  const symbols = alerts.slice(0, 3).map((item) => ({
    market: item.market,
    symbol: String(item.symbol).slice(0, 40),
    name: String(item.name).slice(0, 80),
  }));

  const messages = validTokens.map((token) => ({
    to: token,
    title: 'Market Pulse 급등 알림',
    body: alertBody(alerts),
    sound: 'default',
    priority: 'high',
    channelId: 'surge-alerts',
    data: {
      screen: 'movers',
      symbols,
      totalAlerts: alerts.length,
    },
  }));

  const tickets = [];
  const receiptTickets = [];
  const invalidTokens = [];

  for (const batch of chunks(messages, MAX_MESSAGES_PER_REQUEST)) {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Expo push request failed: ${response.status}`);
    }

    const payload = await response.json();
    const batchTickets = Array.isArray(payload?.data) ? payload.data : [];
    if (batchTickets.length !== batch.length) {
      throw new Error('Expo returned an incomplete ticket response');
    }
    tickets.push(...batchTickets);

    batchTickets.forEach((ticket, index) => {
      const token = batch[index]?.to;
      if (ticket?.status === 'ok' && ticket?.id && token) {
        receiptTickets.push({ id: ticket.id, token });
      }
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        if (token) invalidTokens.push(token);
      }
    });
  }

  return {
    sent: tickets.filter((ticket) => ticket?.status === 'ok').length,
    invalidTokens: [...new Set(invalidTokens)],
    tickets,
    receiptTickets,
  };
}

export async function getExpoPushReceipts(
  receiptIds,
  { fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  const ids = [...new Set((receiptIds ?? []).filter((id) => typeof id === 'string' && id))];
  const receipts = {};

  for (const batch of chunks(ids, MAX_RECEIPTS_PER_REQUEST)) {
    const response = await fetchImpl(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: batch }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Expo receipt request failed: ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.data && typeof payload.data === 'object') {
      Object.assign(receipts, payload.data);
    }
  }

  return receipts;
}
