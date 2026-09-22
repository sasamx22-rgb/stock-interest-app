export const DEFAULT_ALERT_RULE = Object.freeze({
  changePercent: 5,
  volumeRatio: 3,
});

export function isAlertEligible(quote, rule = DEFAULT_ALERT_RULE) {
  return quote.changePercent >= rule.changePercent && quote.volumeRatio >= rule.volumeRatio;
}

export function describeAlert(quote, rule = DEFAULT_ALERT_RULE) {
  if (isAlertEligible(quote, rule)) {
    return `상승률 ${quote.changePercent.toFixed(2)}%, 거래량 ${quote.volumeRatio.toFixed(1)}배로 알림 조건을 충족했습니다.`;
  }

  const missing = [];
  if (quote.changePercent < rule.changePercent) missing.push(`상승률 ${rule.changePercent}%`);
  if (quote.volumeRatio < rule.volumeRatio) missing.push(`거래량 ${rule.volumeRatio}배`);
  return `${missing.join(' 및 ')} 기준을 기다리고 있습니다.`;
}

