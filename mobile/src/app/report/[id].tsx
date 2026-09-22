import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getReport, getReportPdfUrl, markReportRead } from '@/lib/market-api';
import { Report } from '@/types/market';

function reportLabel(report: Report) {
  return report.type === 'morning' ? '08:00 모닝 브리프' : '08:50 프리마켓';
}

export default function ReportDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [state, setState] = useState<{
    id?: string;
    status: 'ready' | 'error';
    report: Report | null;
  }>({ id: undefined, status: 'ready', report: null });

  useEffect(() => {
    if (!id) return;

    let active = true;
    getReport(id)
      .then((value) => {
        if (value) void markReportRead(id);
        if (active) {
          setState({ id, status: 'ready', report: value });
        }
      })
      .catch(() => {
        if (active) setState({ id, status: 'error', report: null });
      });

    return () => {
      active = false;
    };
  }, [id]);

  const loading = Boolean(id) && state.id !== id;
  const report = state.id === id ? state.report : null;
  const loadError = state.id === id && state.status === 'error';

  return (
    <ScreenShell>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹ 보고서 목록</Text>
      </Pressable>

      {loading ? <ActivityIndicator color={palette.primary} /> : null}

      {loadError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>보고서를 불러오지 못했습니다.</Text>
          <Text style={styles.emptyText}>서버 연결 또는 API 키 설정을 확인해주세요.</Text>
        </View>
      ) : !loading && !report ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>보고서를 찾을 수 없습니다.</Text>
          <Text style={styles.emptyText}>보고서가 삭제되었거나 아직 동기화되지 않았습니다.</Text>
        </View>
      ) : null}

      {report ? (
        <>
          <View>
            <Text style={styles.eyebrow}>{reportLabel(report)}</Text>
            <Text style={styles.heading}>{report.title}</Text>
            <Text style={styles.date}>
              {new Date(report.publishedAt).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionLabel}>핵심 요약</Text>
            <Text style={styles.summary}>{report.summary}</Text>
          </View>

          {report.marketSummary ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>시장 해설</Text>
              <Text style={styles.body}>{report.marketSummary}</Text>
            </View>
          ) : null}

          {report.highlights && report.highlights.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>오늘의 체크포인트</Text>
              <View style={styles.highlightList}>
                {report.highlights.map((highlight, index) => (
                  <View key={`${index}-${highlight}`} style={styles.highlightRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.highlightText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {report.tickers.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>관련 종목</Text>
              <View style={styles.chipRow}>
                {report.tickers.map((ticker) => (
                  <Text key={ticker} style={styles.chip}>#{ticker}</Text>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            disabled={!report.pdfUrl}
            onPress={async () => {
              if (!report.pdfUrl) return;
              const url = await getReportPdfUrl(report.id);
              if (url) await Linking.openURL(url);
            }}
            style={[styles.pdfButton, !report.pdfUrl && styles.pdfButtonDisabled]}>
            <Text style={[styles.pdfButtonText, !report.pdfUrl && styles.pdfButtonTextDisabled]}>
              {report.pdfUrl ? 'PDF 원문 열기' : 'PDF 원문 미연결'}
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  heading: { color: palette.text, fontSize: 28, lineHeight: 36, fontWeight: '900', marginTop: spacing.sm },
  date: { color: palette.textMuted, fontSize: 12, marginTop: spacing.sm },
  summaryCard: {
    backgroundColor: palette.primaryMuted,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  sectionLabel: { color: palette.primary, fontSize: 12, fontWeight: '900' },
  summary: { color: palette.text, fontSize: 16, lineHeight: 24, fontWeight: '700', marginTop: spacing.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: { color: palette.text, fontSize: 16, fontWeight: '900' },
  body: { color: palette.textMuted, fontSize: 14, lineHeight: 22, marginTop: spacing.md },
  highlightList: { gap: spacing.md, marginTop: spacing.md },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary, marginTop: 7 },
  highlightText: { flex: 1, color: palette.text, fontSize: 14, lineHeight: 21 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    color: palette.blue,
    backgroundColor: '#122C4A',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '800',
  },
  pdfButton: { backgroundColor: palette.primary, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  pdfButtonDisabled: { backgroundColor: palette.surfaceRaised },
  pdfButtonText: { color: palette.background, fontWeight: '900' },
  pdfButtonTextDisabled: { color: palette.textMuted },
  empty: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.xl },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
});
