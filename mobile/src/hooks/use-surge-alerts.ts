import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { getLiveAlerts, isLiveDataConfigured } from '@/lib/market-api';

const POLL_INTERVAL_MS = 120_000;

export function useSurgeAlerts() {
  const previousEligible = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!isLiveDataConfigured()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      if (AppState.currentState !== 'active') return;

      try {
        const items = await getLiveAlerts();
        if (cancelled) return;

        const current = new Set(items.map((item) => `${item.market}:${item.symbol}`));

        if (initialized.current) {
          const newlyEligible = items.filter(
            (item) => !previousEligible.current.has(`${item.market}:${item.symbol}`),
          );

          if (newlyEligible.length > 0) {
            const preview = newlyEligible
              .slice(0, 3)
              .map(
                (item) =>
                  `${item.name} +${item.changePercent.toFixed(2)}% · 거래량 ${item.volumeRatio.toFixed(1)}배`,
              )
              .join('\n');
            const suffix = newlyEligible.length > 3
              ? `\n외 ${newlyEligible.length - 3}개 종목`
              : '';

            Alert.alert('새 급등 신호', `${preview}${suffix}`);
          }
        } else {
          initialized.current = true;
        }

        previousEligible.current = current;
      } catch {
        // Network/provider errors are intentionally silent here.
        // The normal screens keep showing their last/fallback state.
      }
    };

    check();
    timer = setInterval(check, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      subscription.remove();
    };
  }, []);
}
