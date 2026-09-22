import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getStockDetail, recordStockView } from '@/lib/market-api';
import { Market, StockDetail } from '@/types/market';

function formatPrice(value: number, market: Market) {
  return market === 'KR'
    ? `${Math.round(value).toLocaleString('ko-KR')}원`
    : `$${value.toFixed(2)}`;
}

function formatVolume(value: number) {
  if (!value) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('ko-KR');
}

function displayDate(value: string) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

export default function StockDetailScreen() {
  const params = useLocalSearchParams<{
    market?: string | string[];
    code?: string | string[];
    name?: string | string[];
  }>();
  const router = useRouter();

  const marketParam = Array.isArray(params.market) ? params.market[0] : params.market;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const market: Market | null = marketParam === 'KR' || marketParam === 'US' ? marketParam : null;

  const resourceKey = market && code ? `${market}:${code}` : undefined;
  const [state, setState] = useState<{
    key?: string;
    status: 'ready' | 'error';
    detail: StockDetail | null;
  }>({ key: undefined, status: 'ready', detail: null });

  useEffect(() => {
    if (!market || !code) return;

    let active = true;
    const key = `${market}:${code}`;
    getStockDetail(market, code, name)
      .then((detail) => {
        if (!active) return;
        setState({ key, status: 'ready', detail });
        if (detail) {
          void recordStockView({
            market,
            code,
            name: detail.quote.name,
          });
        }
      })
      .catch(() => {
        if (active) setState({ key, status: 'error', detail: null });
      });

    return () => {
      active = false;
    };
  }, [market, code, name]);

  const loading = Boolean(resourceKey) && state.key !== resourceKey;
  const loadError = Boolean(resourceKey) && state.key === resourceKey && state.status === 'error';
  const detail = state.key === resourceKey ? state.detail : null;
  const flow = useMemo(() => {
    if (!detail || detail.prices.length < 2) return null;

    const newest = detail.prices[0].closePrice;
    const oldest = detail.prices[Math.min(detail.prices.length - 1, 4)].closePrice;
    const change = oldest ? ((newest / oldest) - 1) * 100 : 0;
    const sample = detail.prices.slice(0, 5).map((item) => item.closePrice);

    return {
      change,
      high: Math.max(...sample),
      low: Math.min(...sample),
    };
  }, [detail]);

  if (!market || !code) {
    return (
      <ScreenShell>
        <Pressable onPress={() => router.back()}><Text style={styles.backText}>‹ 뒤로</Text></Pressable>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>잘못된 종목 경로입니다.</Text>
        </View>
      </ScreenShell>
    );
  }

  const naverUrl = market === 'KR'
    ? `https://stock.naver.com/domestic/stock/${code}/total`
    : `https://stock.naver.com/worldstock/stock/${code}/total`;

  return (
    <ScreenShell>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹ 뒤로</Text>
      </Pressable>

      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>종목 정보를 불러오는 중입니다.</Text>
        </View>
      ) : null}

      {loadError || (!loading && !detail) ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>종목 정보를 불러오지 못했습니다.</Text>
          <Text style={styles.emptyText}>서버 연결 또는 네이버 응답 상태를 확인해주세요.</Text>
        </View>
      ) : null}

      {detail ? (
        <>
          <View style={styles.hero}>
            <View style={styles.marketBadge}>
              <Text style={styles.marketBadgeText}>{detail.quote.market}</Text>
            </View>
            <Text style={styles.name}>{detail.quote.name}</Text>
            <Text style={styles.symbol}>{detail.quote.symbol}</Text>
            <Text style={styles.price}>{formatPrice(detail.quote.price, detail.quote.market)}</Text>
            <Text style={[
              styles.change,
              { color: detail.quote.changePercent >= 0 ? palette.gain : palette.loss },
            ]}>
              {detail.quote.changePercent >= 0 ? '+' : ''}{detail.quote.changePercent.toFixed(2)}%
            </Text>
          </View>

          {detail.availability?.prices === 'unavailable' || detail.availability?.news === 'unavailable' ? (
            <View style={styles.partialNotice}>
              <Text style={styles.partialNoticeText}>
                현재가는 조회됐지만 일부 보조 데이터
                {detail.availability?.prices === 'unavailable' && detail.availability?.news === 'unavailable'
                  ? '(일별 시세·뉴스)'
                  : detail.availability?.prices === 'unavailable'
                    ? '(일별 시세)'
                    : '(뉴스)'}
                를 불러오지 못했습니다.
              </Text>
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>거래량 배수</Text>
              <Text style={styles.metricValue}>{detail.quote.volumeRatio.toFixed(1)}배</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>최근 5거래일</Text>
              <Text style={[
                styles.metricValue,
                flow ? { color: flow.change >= 0 ? palette.gain : palette.loss } : null,
              ]}>
                {flow ? `${flow.change >= 0 ? '+' : ''}${flow.change.toFixed(2)}%` : '-'}
              </Text>
            </View>
          </View>

          <View style={styles.reasonCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>상승·하락 원인</Text>
              <View style={styles.reasonBadgeRow}>
                {detail.movementReason?.aiEnhanced ? (
                  <Text style={styles.aiBadge}>AI 보강</Text>
                ) : null}
                <Text style={styles.reasonBadge}>
                  {detail.movementReason?.label ?? '원인 확인 중'}
                </Text>
              </View>
            </View>
            <Text style={styles.reasonSummary}>
              {detail.movementReason?.summary
                ?? '현재 수집된 뉴스만으로는 변동 원인을 특정하기 어렵습니다.'}
            </Text>
            <Text style={styles.reasonNote}>
              {detail.movementReason?.aiEnhanced
                ? `${detail.movementReason.model ?? 'AI'}가 뉴스·일정 근거를 바탕으로 문장을 보강했습니다. `
                : ''}
              단일 원인으로 확정한 내용이나 투자 추천은 아닙니다.
            </Text>
          </View>

          {flow ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>최근 흐름</Text>
              <Text style={styles.body}>
                최근 5개 시세 기준 고가 {formatPrice(flow.high, market)}, 저가 {formatPrice(flow.low, market)}입니다.
                이 수치는 단순 가격 흐름 요약이며 향후 수익률을 의미하지 않습니다.
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>최근 일별 시세</Text>
              <Text style={styles.sectionCaption}>최대 7개</Text>
            </View>
            {detail.prices.length === 0 ? (
              <Text style={styles.emptyInline}>
                {detail.availability?.prices === 'unavailable'
                  ? '일별 시세 연결에 실패했습니다.'
                  : '표시할 일별 시세가 없습니다.'}
              </Text>
            ) : detail.prices.slice(0, 7).map((point) => (
              <View key={`${point.date}-${point.closePrice}`} style={styles.priceRow}>
                <Text style={styles.rowDate}>{displayDate(point.date)}</Text>
                <Text style={styles.rowPrice}>{formatPrice(point.closePrice, market)}</Text>
                <Text style={[
                  styles.rowChange,
                  { color: point.changePercent >= 0 ? palette.gain : palette.loss },
                ]}>
                  {point.changePercent >= 0 ? '+' : ''}{point.changePercent.toFixed(2)}%
                </Text>
                <Text style={styles.rowVolume}>{formatVolume(point.volume)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>최근 뉴스</Text>
              <Text style={styles.sectionCaption}>{detail.news.length}개</Text>
            </View>
            {detail.news.length === 0 ? (
              <Text style={styles.emptyInline}>
                {detail.availability?.news === 'unavailable'
                  ? '뉴스 연결에 실패했습니다.'
                  : '표시할 최근 뉴스가 없습니다.'}
              </Text>
            ) : detail.news.slice(0, 8).map((item, index) => (
              <Pressable
                key={`${index}-${item.title}`}
                disabled={!item.url}
                onPress={() => item.url && Linking.openURL(item.url)}
                style={({ pressed }) => [styles.newsRow, pressed && styles.pressed]}>
                <Text style={styles.newsTitle}>{item.title}</Text>
                <View style={styles.newsMeta}>
                  {item.publisher ? <Text style={styles.newsMetaText}>{item.publisher}</Text> : null}
                  {item.publishedAt ? <Text style={styles.newsMetaText}>{item.publishedAt}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => Linking.openURL(naverUrl)} style={styles.naverButton}>
            <Text style={styles.naverButtonText}>네이버 증권 원문 열기</Text>
          </Pressable>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.border,
  },
  marketBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.primaryMuted,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  marketBadgeText: { color: palette.primary, fontSize: 10, fontWeight: '900' },
  name: { color: palette.text, fontSize: 25, fontWeight: '900', marginTop: spacing.md },
  symbol: { color: palette.textMuted, fontSize: 13, marginTop: spacing.xs },
  price: { color: palette.text, fontSize: 31, fontWeight: '900', marginTop: spacing.lg },
  change: { fontSize: 16, fontWeight: '900', marginTop: spacing.xs },
  partialNotice: {
    backgroundColor: '#3A321C',
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  partialNoticeText: { color: palette.warning, fontSize: 11, lineHeight: 17 },
  metricsRow: { flexDirection: 'row', gap: spacing.md },
  metricCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricLabel: { color: palette.textMuted, fontSize: 11 },
  metricValue: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  reasonCard: {
    backgroundColor: '#162A2B',
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  reasonBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiBadge: {
    color: palette.background,
    backgroundColor: palette.primary,
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  reasonBadge: {
    color: palette.primary,
    backgroundColor: palette.primaryMuted,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  reasonSummary: { color: palette.text, fontSize: 14, lineHeight: 22, marginTop: spacing.md },
  reasonNote: { color: palette.textMuted, fontSize: 10, lineHeight: 16, marginTop: spacing.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: palette.text, fontSize: 16, fontWeight: '900' },
  sectionCaption: { color: palette.textMuted, fontSize: 11 },
  body: { color: palette.textMuted, fontSize: 13, lineHeight: 21, marginTop: spacing.md },
  priceRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDate: { width: 58, color: palette.textMuted, fontSize: 11 },
  rowPrice: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
  rowChange: { width: 70, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  rowVolume: { width: 58, textAlign: 'right', color: palette.textMuted, fontSize: 11 },
  newsRow: { paddingVertical: spacing.md, borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth },
  newsTitle: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  newsMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  newsMetaText: { color: palette.textMuted, fontSize: 10 },
  pressed: { opacity: 0.65 },
  naverButton: { backgroundColor: palette.primaryMuted, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  naverButtonText: { color: palette.primary, fontWeight: '900' },
  empty: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.xl },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  emptyInline: { color: palette.textMuted, fontSize: 13, marginTop: spacing.md },
});
