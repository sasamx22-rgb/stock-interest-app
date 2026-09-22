import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getReports } from '@/lib/market-api';
import { Report } from '@/types/market';

export default function ReportsScreen() {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => { getReports().then(setReports); }, []);

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>REPORT LIBRARY</Text>
        <Text style={styles.heading}>보고서 보관함</Text>
        <Text style={styles.description}>PDF 원문과 앱용 요약을 날짜별로 모아봅니다.</Text>
      </View>

      {reports.map((report) => (
        <View key={report.id} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.type}>{report.type === 'morning' ? '08:00 모닝 브리프' : '08:50 프리마켓'}</Text>
            <Text style={styles.date}>{new Date(report.publishedAt).toLocaleDateString('ko-KR')}</Text>
          </View>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.summary}>{report.summary}</Text>
          <View style={styles.chipRow}>
            {report.tickers.map((ticker) => <Text key={ticker} style={styles.chip}>#{ticker}</Text>)}
          </View>
          <Pressable
            disabled={!report.pdfUrl}
            onPress={() => report.pdfUrl && Linking.openURL(report.pdfUrl)}
            style={[styles.pdfButton, !report.pdfUrl && styles.pdfButtonDisabled]}>
            <Text style={styles.pdfButtonText}>{report.pdfUrl ? 'PDF 원문 열기' : 'PDF 연결 준비 중'}</Text>
          </Pressable>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  description: { color: palette.textMuted, fontSize: 14, marginTop: spacing.sm },
  card: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { color: palette.primary, fontSize: 12, fontWeight: '900' },
  date: { color: palette.textMuted, fontSize: 11 },
  title: { color: palette.text, fontSize: 19, fontWeight: '900', marginTop: spacing.md },
  summary: { color: palette.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { color: palette.blue, backgroundColor: '#122C4A', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, fontSize: 11, fontWeight: '700' },
  pdfButton: { backgroundColor: palette.primary, borderRadius: 12, alignItems: 'center', marginTop: spacing.lg, paddingVertical: 12 },
  pdfButtonDisabled: { backgroundColor: palette.surfaceRaised },
  pdfButtonText: { color: palette.background, fontWeight: '900' },
});
