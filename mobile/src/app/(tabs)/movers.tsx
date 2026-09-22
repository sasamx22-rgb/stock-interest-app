import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { QuoteRow } from '@/components/quote-row';
import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getMovers } from '@/lib/market-api';
import { Market, MarketMover } from '@/types/market';

export default function MoversScreen() {
  const [market, setMarket] = useState<Market>('KR');
  const [items, setItems] = useState<MarketMover[]>([]);

  useEffect(() => {
    getMovers(market).then(setItems);
  }, [market]);

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>SURGE RADAR</Text>
        <Text style={styles.heading}>급등 탐지</Text>
        <Text style={styles.description}>상승률 5%와 거래량 3배 조건을 함께 확인합니다.</Text>
      </View>

      <View style={styles.segment}>
        {(['KR', 'US'] as Market[]).map((value) => (
          <Pressable key={value} onPress={() => setMarket(value)} style={[styles.segmentButton, market === value && styles.segmentActive]}>
            <Text style={[styles.segmentText, market === value && styles.segmentTextActive]}>{value === 'KR' ? '한국' : '미국'}</Text>
          </Pressable>
        ))}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>현재 표시할 종목이 없습니다.</Text></View>
      ) : items.map((item) => (
        <View key={`${item.market}-${item.symbol}`} style={[styles.moverCard, item.alertEligible && styles.alertCard]}>
          <QuoteRow quote={item} />
          <View style={styles.metrics}>
            <Text style={styles.metric}>거래량 <Text style={styles.metricValue}>{item.volumeRatio.toFixed(1)}배</Text></Text>
            <Text style={[styles.status, item.alertEligible ? styles.statusActive : styles.statusWaiting]}>
              {item.alertEligible ? '알림 조건 충족' : '관찰 중'}
            </Text>
          </View>
          <Text style={styles.reason}>{item.reason}</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  description: { color: palette.textMuted, fontSize: 14, marginTop: spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: palette.surface, padding: 4, borderRadius: 14 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11 },
  segmentActive: { backgroundColor: palette.primaryMuted },
  segmentText: { color: palette.textMuted, fontWeight: '800' },
  segmentTextActive: { color: palette.primary },
  moverCard: { backgroundColor: palette.surface, borderRadius: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderWidth: 1, borderColor: palette.border },
  alertCard: { borderColor: palette.primary },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  metric: { color: palette.textMuted, fontSize: 12 },
  metricValue: { color: palette.text, fontWeight: '900' },
  status: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  statusActive: { color: palette.primary, backgroundColor: palette.primaryMuted },
  statusWaiting: { color: palette.warning, backgroundColor: '#3A321C' },
  reason: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  empty: { backgroundColor: palette.surface, padding: spacing.xl, borderRadius: 20 },
  emptyText: { color: palette.textMuted, textAlign: 'center' },
});
