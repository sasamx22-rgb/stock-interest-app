import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getReport, getReportPdfUrl, markReportRead } from '@/lib/market-api';
import { saveReportPdf } from '@/lib/report-pdf-download';
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
  const [pdfMessage, setPdfMessage] = useState('');
  const [pdfSaving, setPdfSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!id) return;

    let active = true;
    getReport(id)
      .then((value) => {
        if (!active) return;
        setState({ id, status: 'ready', report: value });
        if (value) void markReportRead(id);
      })
      .catch(() => {
        if (active) setState({ id, status: 'error', report: null });
      });

    return () => {
      active = false;
    };
  }, [id]));

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
            <View style={styles.reportMetaRow}>
              <Text style={styles.eyebrow}>{reportLabel(report)}</Text>
              {report.reconstructed ? <Text style={styles.reconstructedBadge}>과거시점 복원</Text> : null}
            </View>
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

          {report.sections && report.sections.length > 0 ? (
            report.sections.map((section, sectionIndex) => (
              <View key={`${sectionIndex}-${section.title}`} style={styles.card}>
                <Text style={styles.sectionTitle}>{section.title}</Text>

                {section.body ? <Text style={styles.body}>{section.body}</Text> : null}

                {section.rows && section.rows.length > 0 ? (
                  <View style={styles.dataRows}>
                    {section.rows.map((row, rowIndex) => (
                      <View key={`${rowIndex}-${row.label}`} style={styles.dataRow}>
                        <View style={styles.dataRowTop}>
                          <Text style={styles.dataLabel}>{row.label}</Text>
                          <Text style={styles.dataValue}>{row.value}</Text>
                        </View>
                        {row.note ? <Text style={styles.dataNote}>{row.note}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {section.bullets && section.bullets.length > 0 ? (
                  <View style={styles.highlightList}>
                    {section.bullets.map((bullet, bulletIndex) => (
                      <View key={`${bulletIndex}-${bullet}`} style={styles.highlightRow}>
                        <View style={styles.bullet} />
                        <Text style={styles.highlightText}>{bullet}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {section.links && section.links.length > 0 ? (
                  <View style={styles.sourceLinks}>
                    {section.links.map((link, linkIndex) => (
                      <Pressable
                        key={`${linkIndex}-${link.url}`}
                        onPress={() => {
                          void Linking.openURL(link.url);
                        }}
                        style={styles.sourceLinkButton}>
                        <Text style={styles.sourceLinkText}>{link.label} ↗</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <>
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
            </>
          )}

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

          <View style={styles.pdfActions}>
            <Pressable
              disabled={!report.pdfUrl || pdfSaving}
              onPress={async () => {
                if (!report.pdfUrl) return;
                setPdfMessage('');
                const url = await getReportPdfUrl(report.id, report.pdfUrl);
                if (!url) {
                  setPdfMessage('PDF 링크를 열 수 없습니다.');
                  return;
                }
                try {
                  await Linking.openURL(url);
                } catch {
                  setPdfMessage('PDF 뷰어를 열지 못했습니다.');
                }
              }}
              style={[
                styles.pdfButton,
                (!report.pdfUrl || pdfSaving) && styles.pdfButtonDisabled,
              ]}>
              <Text style={[
                styles.pdfButtonText,
                (!report.pdfUrl || pdfSaving) && styles.pdfButtonTextDisabled,
              ]}>
                {report.pdfUrl ? 'PDF 원문 열기' : 'PDF 원문 미연결'}
              </Text>
            </Pressable>

            <Pressable
              disabled={!report.pdfUrl || pdfSaving}
              onPress={async () => {
                if (!report.pdfUrl) return;
                setPdfMessage('');
                setPdfSaving(true);
                try {
                  const result = await saveReportPdf(report);
                  setPdfMessage(
                    result.sharingAvailable
                      ? 'PDF를 저장했습니다. 원하는 앱이나 위치를 선택해주세요.'
                      : 'PDF를 앱 문서 영역에 저장했습니다.',
                  );
                } catch {
                  setPdfMessage('PDF 저장에 실패했습니다. 다시 시도해주세요.');
                } finally {
                  setPdfSaving(false);
                }
              }}
              style={[
                styles.pdfSaveButton,
                (!report.pdfUrl || pdfSaving) && styles.pdfButtonDisabled,
              ]}>
              <Text style={[
                styles.pdfSaveButtonText,
                (!report.pdfUrl || pdfSaving) && styles.pdfButtonTextDisabled,
              ]}>
                {pdfSaving ? '저장 중...' : 'PDF 저장'}
              </Text>
            </Pressable>
          </View>
          {pdfMessage ? <Text style={styles.pdfMessage}>{pdfMessage}</Text> : null}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
  reportMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  reconstructedBadge: {
    color: palette.warning,
    backgroundColor: '#3A321C',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
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
  dataRows: { gap: spacing.sm, marginTop: spacing.md },
  dataRow: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dataRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  dataLabel: { flex: 1, color: palette.textMuted, fontSize: 12, fontWeight: '800' },
  dataValue: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  dataNote: { color: palette.textMuted, fontSize: 11, lineHeight: 17, marginTop: spacing.xs },
  highlightList: { gap: spacing.md, marginTop: spacing.md },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary, marginTop: 7 },
  highlightText: { flex: 1, color: palette.text, fontSize: 14, lineHeight: 21 },
  sourceLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  sourceLinkButton: {
    backgroundColor: '#122C4A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sourceLinkText: { color: palette.blue, fontSize: 12, fontWeight: '800' },
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
  pdfActions: { flexDirection: 'row', gap: spacing.sm },
  pdfButton: { flex: 1, backgroundColor: palette.primary, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  pdfSaveButton: { flex: 1, backgroundColor: palette.surfaceRaised, borderRadius: 14, alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: palette.border },
  pdfButtonDisabled: { backgroundColor: palette.surfaceRaised },
  pdfButtonText: { color: palette.background, fontWeight: '900' },
  pdfSaveButtonText: { color: palette.text, fontWeight: '900' },
  pdfButtonTextDisabled: { color: palette.textMuted },
  pdfMessage: { color: palette.warning, fontSize: 11, textAlign: 'center' },
  empty: { backgroundColor: palette.surface, borderRadius: 20, padding: spacing.xl },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
});
