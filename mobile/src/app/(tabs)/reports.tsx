import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getEngagementSummary, getReports } from '@/lib/market-api';
import { Report } from '@/types/market';

export default function ReportsScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [unreadReportIds, setUnreadReportIds] = useState<string[]>([]);
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([getReports(), getEngagementSummary()]).then(([items, engagement]) => {
      if (!active) return;
      setReports(items);
      setUnreadReportIds(engagement.unreadReportIds);
    });
    return () => {
      active = false;
    };
  }, []));

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>REPORT LIBRARY</Text>
        <Text style={styles.heading}>보고서 보관함</Text>
        <Text style={styles.description}>08:00 모닝 브리프와 08:50 프리마켓 보고서를 날짜별로 모아봅니다.</Text>
      </View>

      {reports.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>저장된 보고서가 없습니다.</Text>
          <Text style={styles.emptyText}>보고서 생성 파이프라인에서 새 보고서를 저장하면 여기에 표시됩니다.</Text>
        </View>
      ) : reports.map((report) => (
        <View key={report.id} style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.typeRow}>
              <Text style={styles.type}>{report.type === 'morning' ? '08:00 모닝 브리프' : '08:50 프리마켓'}</Text>
              {unreadReportIds.includes(report.id) ? <Text style={styles.newBadge}>NEW</Text> : null}
            </View>
            <Text style={styles.date}>{new Date(report.publishedAt).toLocaleDateString('ko-KR')}</Text>
          </View>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.summary} numberOfLines={3}>{report.summary}</Text>

          {report.tickers.length > 0 ? (
            <View style={styles.chipRow}>
              {report.tickers.slice(0, 5).map((ticker) => <Text key={ticker} style={styles.chip}>#{ticker}</Text>)}
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })}
              style={styles.detailButton}>
              <Text style={styles.detailButtonText}>앱 요약 보기</Text>
            </Pressable>

            <Pressable
              disabled={!report.pdfUrl}
              onPress={() => report.pdfUrl && Linking.openURL(report.pdfUrl)}
              style={[styles.pdfButton, !report.pdfUrl && styles.pdfButtonDisabled]}>
              <Text style={[styles.pdfButtonText, !report.pdfUrl && styles.pdfButtonTextDisabled]}>
                {report.pdfUrl ? 'PDF' : 'PDF 없음'}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  description: { color: palette.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  card: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  type: { color: palette.primary, fontSize: 12, fontWeight: '900' },
  newBadge: {
    color: palette.warning,
    backgroundColor: '#3A321C',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    overflow: 'hidden',
  },
  date: { color: palette.textMuted, fontSize: 11 },
  title: { color: palette.text, fontSize: 19, fontWeight: '900', marginTop: spacing.md },
  summary: { color: palette.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { color: palette.blue, backgroundColor: '#122C4A', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, fontSize: 11, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  detailButton: { flex: 1, backgroundColor: palette.primary, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
  detailButtonText: { color: palette.background, fontWeight: '900' },
  pdfButton: { minWidth: 82, backgroundColor: palette.surfaceRaised, borderRadius: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  pdfButtonDisabled: { opacity: 0.55 },
  pdfButtonText: { color: palette.text, fontWeight: '900' },
  pdfButtonTextDisabled: { color: palette.textMuted },
  empty: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.xl, borderWidth: 1, borderColor: palette.border },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
});
