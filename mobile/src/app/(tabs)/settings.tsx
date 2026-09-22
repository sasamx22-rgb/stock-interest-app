import { StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { isLiveDataConfigured } from '@/lib/market-api';

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

export default function SettingsScreen() {
  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>PREFERENCES</Text>
        <Text style={styles.heading}>설정</Text>
      </View>

      <View style={styles.card}>
        <SettingRow label="상승률 기준" value="5%" />
        <SettingRow label="거래량 기준" value="최근 평균의 3배" />
        <SettingRow label="대상 시장" value="한국 · 미국" />
        <SettingRow label="조회 주기" value="1~3분" />
      </View>

      <View style={styles.card}>
        <SettingRow label="데이터 연결" value={isLiveDataConfigured() ? '백엔드 연결됨' : '샘플 모드'} />
        <SettingRow label="데이터 출처" value="NAVER 우선" />
        <SettingRow label="배포 방식" value="개인용 APK" />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>투자 참고용</Text>
        <Text style={styles.noticeText}>표시된 정보는 지연되거나 오류가 있을 수 있으며 투자 판단의 유일한 근거로 사용할 수 없습니다.</Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  card: { backgroundColor: palette.surface, borderRadius: 20, paddingHorizontal: spacing.lg, borderColor: palette.border, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.lg, borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: palette.textMuted, fontSize: 14 },
  value: { color: palette.text, fontSize: 14, fontWeight: '800' },
  notice: { backgroundColor: '#3A321C', borderRadius: 16, padding: spacing.lg },
  noticeTitle: { color: palette.warning, fontSize: 13, fontWeight: '900' },
  noticeText: { color: '#D4C8A8', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
});
