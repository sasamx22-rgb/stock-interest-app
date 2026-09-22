import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getCalendarEvents } from '@/lib/market-api';
import { CalendarEvent } from '@/types/market';

const typeLabel: Record<CalendarEvent['type'], string> = {
  macro: '경제지표',
  fomc: 'FOMC',
  earnings: '실적',
  dividend: '배당락',
  filing: '공시',
  custom: '기타',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
}

export default function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getCalendarEvents(21).then((items) => {
      if (active) setEvents(items);
    });
    return () => {
      active = false;
    };
  }, []));

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = new Date(event.startsAt).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Seoul',
      });
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>ECONOMIC CALENDAR</Text>
        <Text style={styles.heading}>경제 일정</Text>
        <Text style={styles.description}>
          실적 발표, 배당락, FOMC와 주요 경제지표 일정을 관심종목 중심으로 확인합니다.
        </Text>
      </View>

      {grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>예정된 주요 일정이 없습니다.</Text>
          <Text style={styles.emptyText}>
            외부 일정 소스가 일시적으로 응답하지 않거나 등록된 관심종목에 일정이 없을 수 있습니다.
          </Text>
        </View>
      ) : grouped.map(([dateKey, items]) => (
        <View key={dateKey} style={styles.daySection}>
          <Text style={styles.dayTitle}>{formatDate(items[0].startsAt)}</Text>
          {items.map((event) => (
            <Pressable
              key={event.id}
              disabled={!event.url}
              onPress={() => event.url && Linking.openURL(event.url)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.topRow}>
                <View style={styles.badgeRow}>
                  <Text style={[
                    styles.typeBadge,
                    event.importance === 'high' && styles.highBadge,
                  ]}>
                    {typeLabel[event.type]}
                  </Text>
                  <Text style={styles.marketBadge}>{event.market}</Text>
                </View>
                <Text style={styles.time}>{formatTime(event.startsAt)}</Text>
              </View>
              <Text style={styles.title}>{event.title}</Text>
              {event.description ? (
                <Text style={styles.descriptionText}>{event.description}</Text>
              ) : null}
              {event.tickers.length > 0 ? (
                <View style={styles.tickerRow}>
                  {event.tickers.slice(0, 5).map((ticker) => (
                    <Text key={ticker} style={styles.ticker}>#{ticker}</Text>
                  ))}
                </View>
              ) : null}
              <Text style={styles.source}>출처: {event.source}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  description: { color: palette.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  daySection: { gap: spacing.sm },
  dayTitle: { color: palette.text, fontSize: 16, fontWeight: '900', marginTop: spacing.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pressed: { opacity: 0.7 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBadge: {
    color: palette.blue,
    backgroundColor: '#122C4A',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
  },
  highBadge: { color: palette.warning, backgroundColor: '#3A321C' },
  marketBadge: {
    color: palette.textMuted,
    backgroundColor: palette.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  time: { color: palette.textMuted, fontSize: 11, fontWeight: '800' },
  title: { color: palette.text, fontSize: 16, fontWeight: '900', marginTop: spacing.md },
  descriptionText: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  tickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  ticker: { color: palette.primary, fontSize: 11, fontWeight: '800' },
  source: { color: palette.textMuted, fontSize: 10, marginTop: spacing.md },
  empty: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
});
