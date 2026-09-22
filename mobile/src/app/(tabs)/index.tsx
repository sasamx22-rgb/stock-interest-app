import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { QuoteRow } from '@/components/quote-row';
import { ScreenShell } from '@/components/screen-shell';
import { SectionTitle } from '@/components/section-title';
import { palette, spacing } from '@/constants/market-theme';
import {
  getHomeBriefing,
  isDemoMode,
  isLiveDataConfigured,
} from '@/lib/market-api';
import {
  AlertRule,
  CalendarEvent,
  EngagementSummary,
  Report,
  TodayFocusStock,
  WeeklyReview,
} from '@/types/market';

const sourceLabel: Record<string, string> = {
  watchlist: '내 관심',
  report: '보고서',
  surge: '급등',
};

function seoulDateLabel() {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function eventTime(event?: CalendarEvent) {
  if (!event) return '예정 없음';
  return new Date(event.startsAt).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardScreen() {
  const router = useRouter();
  const [focusStocks, setFocusStocks] = useState<TodayFocusStock[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [engagement, setEngagement] = useState<EngagementSummary>({
    unreadReportIds: [],
    unreadReportCount: 0,
    dailyPicks: [],
  });
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [rule, setRule] = useState<AlertRule>({ changePercent: 5, volumeRatio: 3 });
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    const requestId = ++refreshGeneration.current;
    setLoading(true);
    setLoadError(false);
    try {
      const briefing = await getHomeBriefing();
      if (requestId !== refreshGeneration.current) return;
      setFocusStocks(briefing.focusStocks);
      setReports(briefing.reports);
      setRule(briefing.alertRule);
      setEngagement(briefing.engagement);
      setWeeklyReview(briefing.weeklyReview);
      setCalendar(briefing.calendar);
      setRefreshedAt(Date.parse(briefing.generatedAt) || Date.now());
    } catch {
      if (requestId === refreshGeneration.current) setLoadError(true);
    } finally {
      if (requestId === refreshGeneration.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]));

  const alertCount = focusStocks.filter((item) => item.alertEligible).length;
  const topMover = useMemo(
    () => [...focusStocks].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0],
    [focusStocks],
  );
  const nextEvent = calendar.find(
    (event) => Date.parse(event.startsAt) >= refreshedAt,
  ) ?? calendar[0];
  const latestReport = reports[0];

  return (
    <ScreenShell>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.brand}>MARKET PULSE</Text>
          <Text style={styles.date}>{seoulDateLabel()}</Text>
          <Text style={styles.heading}>오늘 시장 브리핑</Text>
          <Text style={styles.subheading}>오늘 확인할 종목과 시장 이벤트를 한눈에 정리했습니다.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정 열기"
          onPress={() => router.push('/(tabs)/settings')}
          style={styles.settingsButton}>
          <Text style={styles.settingsGlyph}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.livePill, (!isLiveDataConfigured() || loadError) && styles.samplePill]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {loadError ? 'CONNECTION ERROR' : isDemoMode() ? 'SAMPLE MODE' : isLiveDataConfigured() ? 'LIVE DATA' : 'NOT CONFIGURED'}
          </Text>
        </View>
        <Text style={styles.ruleText}>
          급등 기준 +{rule.changePercent}% · 거래량 {rule.volumeRatio}배
        </Text>
      </View>

      {loading ? <ActivityIndicator color={palette.primary} /> : null}

      <View style={styles.section}>
        <SectionTitle title="오늘 꼭 볼 3종목" action="우선순위 자동 선정" />
        {engagement.dailyPicks.length > 0 ? (
          <View style={styles.pickStack}>
            {engagement.dailyPicks.map((item, index) => (
              <View key={'pick-' + item.market + '-' + item.naverCode} style={styles.pickCard}>
                <View style={styles.pickHeader}>
                  <Text style={styles.pickRank}>{index + 1}</Text>
                  <View style={styles.pickHeaderCopy}>
                    <View style={styles.badgeRow}>
                      {item.sources.map((source) => (
                        <Text
                          key={source}
                          style={[
                            styles.sourceBadge,
                            source === 'surge' && styles.surgeBadge,
                            source === 'report' && styles.reportBadge,
                          ]}>
                          {sourceLabel[source]}
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.pickReason}>{item.pickReason}</Text>
                  </View>
                </View>
                <QuoteRow quote={item} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>오늘 선정할 종목 데이터가 아직 없습니다.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="오늘 시장 한눈에" />
        <View style={styles.marketCard}>
          <View style={styles.marketMetric}>
            <Text style={styles.marketMetricLabel}>급등 신호</Text>
            <Text style={styles.marketMetricValue}>{alertCount}개</Text>
            <Text style={styles.marketMetricCaption}>현재 설정 기준 충족</Text>
          </View>
          <View style={styles.marketDivider} />
          <View style={styles.marketMetric}>
            <Text style={styles.marketMetricLabel}>가장 큰 움직임</Text>
            <Text style={styles.marketMetricValue} numberOfLines={1}>
              {topMover?.name ?? '-'}
            </Text>
            <Text style={[
              styles.marketMetricCaption,
              topMover
                ? { color: topMover.changePercent >= 0 ? palette.gain : palette.loss }
                : null,
            ]}>
              {topMover
                ? `${topMover.changePercent >= 0 ? '+' : ''}${topMover.changePercent.toFixed(2)}%`
                : '데이터 없음'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.shortcutRow}>
        <Pressable
          onPress={() => router.push('/(tabs)/calendar')}
          style={({ pressed }) => [styles.shortcutCard, pressed && styles.pressed]}>
          <View style={styles.shortcutIcon}><Text style={styles.shortcutIconText}>◷</Text></View>
          <Text style={styles.shortcutTitle}>경제 일정</Text>
          <Text style={styles.shortcutValue}>{calendar.length}개 예정</Text>
          <Text style={styles.shortcutDetail} numberOfLines={2}>
            {nextEvent ? `${eventTime(nextEvent)} · ${nextEvent.title}` : '예정된 주요 일정 없음'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(tabs)/reports')}
          style={({ pressed }) => [styles.shortcutCard, pressed && styles.pressed]}>
          <View style={[styles.shortcutIcon, styles.reportShortcutIcon]}>
            <Text style={styles.reportShortcutIconText}>▤</Text>
          </View>
          <Text style={styles.shortcutTitle}>안 읽은 보고서</Text>
          <Text style={styles.shortcutValue}>{engagement.unreadReportCount}개</Text>
          <Text style={styles.shortcutDetail} numberOfLines={2}>
            {latestReport?.title ?? '새 보고서가 없습니다.'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionTitle title="오늘의 관심 종목" action={`${focusStocks.length}개 통합`} />
        {focusStocks.length > 0 ? (
          <View style={styles.focusCard}>
            {focusStocks.slice(0, 6).map((item) => (
              <View key={item.market + '-' + item.naverCode}>
                <View style={styles.badgeRow}>
                  {item.sources.map((source) => (
                    <Text
                      key={source}
                      style={[
                        styles.sourceBadge,
                        source === 'surge' && styles.surgeBadge,
                        source === 'report' && styles.reportBadge,
                      ]}>
                      {sourceLabel[source]}
                    </Text>
                  ))}
                </View>
                <QuoteRow quote={item} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              관심종목을 추가하거나 보고서에 종목이 포함되면 여기에 통합됩니다.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="주간 관심 종목 회고" action="최근 7일" />
        {weeklyReview ? (
          <View style={styles.reviewCard}>
            <View style={styles.reviewMetrics}>
              <View style={styles.reviewMetric}>
                <Text style={styles.reviewValue}>{weeklyReview.uniqueStockCount}</Text>
                <Text style={styles.reviewLabel}>확인한 종목</Text>
              </View>
              <View style={styles.reviewMetric}>
                <Text style={styles.reviewValue}>{weeklyReview.reportsRead}</Text>
                <Text style={styles.reviewLabel}>읽은 보고서</Text>
              </View>
              <View style={styles.reviewMetric}>
                <Text style={styles.reviewValue}>{weeklyReview.currentWatchlistCount}</Text>
                <Text style={styles.reviewLabel}>관심종목</Text>
              </View>
            </View>

            {weeklyReview.topViewed.length > 0 ? (
              <View style={styles.reviewList}>
                <Text style={styles.reviewTitle}>이번 주 자주 본 종목</Text>
                {weeklyReview.topViewed.slice(0, 3).map((item, index) => (
                  <View key={'review-' + item.market + '-' + item.code} style={styles.reviewRow}>
                    <Text style={styles.reviewRank}>{index + 1}</Text>
                    <Text style={styles.reviewName}>{item.name}</Text>
                    <Text style={styles.reviewViews}>{item.views}회</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.reviewEmpty}>종목 상세를 확인하면 주간 회고가 쌓입니다.</Text>
            )}
          </View>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1 },
  brand: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.7 },
  date: { color: palette.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.md },
  heading: { color: palette.text, fontSize: 30, lineHeight: 36, fontWeight: '900', marginTop: spacing.xs },
  subheading: { color: palette.textMuted, fontSize: 13, lineHeight: 20, marginTop: spacing.sm },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsGlyph: { color: palette.text, fontSize: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primaryMuted, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  samplePill: { backgroundColor: '#3A321C' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary, marginRight: 6 },
  liveText: { color: palette.primary, fontSize: 9, fontWeight: '900' },
  ruleText: { flex: 1, color: palette.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'right' },
  section: { gap: spacing.md },
  pickStack: { gap: spacing.sm },
  pickCard: {
    backgroundColor: '#10262B',
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  pickHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pickRank: {
    width: 28,
    height: 28,
    lineHeight: 28,
    textAlign: 'center',
    color: palette.background,
    backgroundColor: palette.primary,
    borderRadius: 14,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '900',
  },
  pickHeaderCopy: { flex: 1, gap: spacing.xs },
  pickReason: { color: palette.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sourceBadge: {
    color: palette.primary,
    backgroundColor: palette.primaryMuted,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
  },
  surgeBadge: { color: palette.gain, backgroundColor: '#3D1E2B' },
  reportBadge: { color: palette.blue, backgroundColor: '#122C4A' },
  marketCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    flexDirection: 'row',
  },
  marketMetric: { flex: 1, gap: spacing.xs },
  marketMetricLabel: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
  marketMetricValue: { color: palette.text, fontSize: 19, fontWeight: '900' },
  marketMetricCaption: { color: palette.textMuted, fontSize: 10, lineHeight: 15 },
  marketDivider: { width: 1, backgroundColor: palette.border, marginHorizontal: spacing.lg },
  shortcutRow: { flexDirection: 'row', gap: spacing.md },
  shortcutCard: {
    flex: 1,
    minHeight: 150,
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pressed: { opacity: 0.7 },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIconText: { color: palette.primary, fontSize: 16, fontWeight: '900' },
  reportShortcutIcon: { backgroundColor: '#3A321C' },
  reportShortcutIconText: { color: palette.warning, fontSize: 15, fontWeight: '900' },
  shortcutTitle: { color: palette.text, fontSize: 13, fontWeight: '900', marginTop: spacing.md },
  shortcutValue: { color: palette.primary, fontSize: 18, fontWeight: '900', marginTop: spacing.xs },
  shortcutDetail: { color: palette.textMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.sm },
  focusCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderColor: palette.border,
    borderWidth: 1,
  },
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderColor: palette.border,
    borderWidth: 1,
  },
  emptyText: { color: palette.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  reviewCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderColor: palette.border,
    borderWidth: 1,
    gap: spacing.lg,
  },
  reviewMetrics: { flexDirection: 'row', gap: spacing.sm },
  reviewMetric: {
    flex: 1,
    backgroundColor: palette.surfaceRaised,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  reviewValue: { color: palette.text, fontSize: 20, fontWeight: '900' },
  reviewLabel: { color: palette.textMuted, fontSize: 10, marginTop: spacing.xs, textAlign: 'center' },
  reviewList: { gap: spacing.sm },
  reviewTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewRank: { width: 22, color: palette.primary, fontSize: 12, fontWeight: '900' },
  reviewName: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
  reviewViews: { color: palette.textMuted, fontSize: 11, fontWeight: '700' },
  reviewEmpty: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
});
