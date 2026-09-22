import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { QuoteRow } from '@/components/quote-row';
import { ScreenShell } from '@/components/screen-shell';
import { SectionTitle } from '@/components/section-title';
import { palette, spacing } from '@/constants/market-theme';
import {
  getAlertSettings,
  getMovers,
  getReports,
  getWatchlist,
  isLiveDataConfigured,
} from '@/lib/market-api';
import { AlertRule, MarketMover, Quote, Report } from '@/types/market';

export default function DashboardScreen() {
  const [watchlist, setWatchlist] = useState<Quote[]>([]);
  const [movers, setMovers] = useState<MarketMover[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [rule, setRule] = useState<AlertRule>({ changePercent: 5, volumeRatio: 3 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [watchlistData, moverData, reportData, alertRule] = await Promise.all([
        getWatchlist(),
        getMovers(),
        getReports(),
        getAlertSettings(),
      ]);
      setWatchlist(watchlistData);
      setMovers(moverData);
      setReports(reportData);
      setRule(alertRule);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MARKET PULSE</Text>
          <Text style={styles.heading}>오늘 시장을{`\n`}놓치지 마세요</Text>
        </View>
        <View style={[styles.livePill, !isLiveDataConfigured() && styles.samplePill]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{isLiveDataConfigured() ? 'LIVE' : 'SAMPLE'}</Text>
        </View>
      </View>

      <View style={styles.signalCard}>
        <Text style={styles.signalLabel}>급등 알림 기준</Text>
        <Text style={styles.signalValue}>
          +{rule.changePercent}% · 거래량 {rule.volumeRatio}배
        </Text>
        <Text style={styles.signalCaption}>
          현재 {movers.filter((item) => item.alertEligible).length}개 종목이 조건을 충족했습니다.
        </Text>
      </View>

      {loading ? <ActivityIndicator color={palette.primary} /> : null}

      <View style={styles.section}>
        <SectionTitle title="내 관심 종목" action={`${watchlist.length}개`} />
        {watchlist.length > 0 ? (
          <View style={styles.card}>
            {watchlist.map((quote) => <QuoteRow key={`${quote.market}-${quote.symbol}`} quote={quote} />)}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>관심 탭에서 한국·미국 종목을 추가해보세요.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="지금 포착된 움직임" action="급등 탭에서 보기" />
        <View style={styles.card}>
          {movers.slice(0, 2).map((quote) => <QuoteRow key={`${quote.market}-${quote.symbol}`} quote={quote} />)}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle title="최근 보고서" action={`${reports.length}개`} />
        {reports.slice(0, 1).map((report) => (
          <View style={styles.reportCard} key={report.id}>
            <Text style={styles.reportType}>{report.type === 'morning' ? '08:00 모닝 브리프' : '08:50 프리마켓'}</Text>
            <Text style={styles.reportTitle}>{report.title}</Text>
            <Text style={styles.reportSummary}>{report.summary}</Text>
            <View style={styles.chipRow}>
              {report.tickers.map((ticker) => <Text key={ticker} style={styles.chip}>#{ticker}</Text>)}
            </View>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, lineHeight: 38, fontWeight: '900', marginTop: spacing.sm },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primaryMuted, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  samplePill: { backgroundColor: '#3A321C' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.warning, marginRight: 6 },
  liveText: { color: palette.warning, fontSize: 10, fontWeight: '900' },
  signalCard: { backgroundColor: palette.primary, borderRadius: 22, padding: spacing.xl },
  signalLabel: { color: '#17312E', fontSize: 13, fontWeight: '800' },
  signalValue: { color: '#07111F', fontSize: 28, fontWeight: '900', marginTop: spacing.xs },
  signalCaption: { color: '#234B46', fontSize: 13, fontWeight: '700', marginTop: spacing.sm },
  section: { gap: spacing.md },
  card: { backgroundColor: palette.surface, borderRadius: 20, paddingHorizontal: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  emptyCard: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  emptyText: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },
  reportCard: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  reportType: { color: palette.primary, fontSize: 12, fontWeight: '900' },
  reportTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  reportSummary: { color: palette.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { color: palette.blue, backgroundColor: '#122C4A', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, fontSize: 11, fontWeight: '700' },
});
