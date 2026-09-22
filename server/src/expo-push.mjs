const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function alertBody(alerts) {
  const preview = alerts.slice(0, 3).map(
    (item) => `${item.name} +${item.changePercent.toFixed(2)}% · 거래량 ${item.volumeRatio.toFixed(1)}배`,
  );
  if (alerts.length > 3) preview.push(`외 ${alerts.length - 3}개 종목`);
  return preview.join('\n');
}

export async function sendExpoPushNotifications(
  tokens,
  alerts,
  { fetchImpl = fetch } = {},
) {
  const validTokens = [...new Set(tokens.filter((token) => typeof token === 'string' && token))];
  if (validTokens.length === 0 || alerts.length === 0) {
    return { sent: 0, invalidTokens: [], tickets: [] };
  }

  const symbols = alerts.map((item) => ({
    market: item.market,
    symbol: item.symbol,
    name: item.name,
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
    },
  }));

  const tickets = [];
  const invalidTokens = [];

  for (const batch of chunks(messages, MAX_MESSAGES_PER_REQUEST)) {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`Expo push request failed: ${response.status}`);
    }

    const payload = await response.json();
    const batchTickets = Array.isArray(payload?.data) ? payload.data : [];
    tickets.push(...batchTickets);

    batchTickets.forEach((ticket, index) => {
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        const token = batch[index]?.to;
        if (token) invalidTokens.push(token);
      }
    });
  }

  return {
    sent: messages.length,
    invalidTokens: [...new Set(invalidTokens)],
    tickets,
  };
}
