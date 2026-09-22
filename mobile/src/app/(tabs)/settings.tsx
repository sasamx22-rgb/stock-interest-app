import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import { getPushStatus, isLiveDataConfigured } from '@/lib/market-api';
import { PushStatus } from '@/types/market';

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

export default function SettingsScreen() {
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getPushStatus()
      .then((status) => {
        if (active) setPushStatus(status);
      })
      .catch(() => {
        if (active) setPushStatus(null);
      });
    return () => {
      active = false;
    };
  }, []));

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
        <SettingRow label="서버 감시 주기" value="2분" />
      </View>

      <View style={styles.card}>
        <SettingRow label="데이터 연결" value={isLiveDataConfigured() ? '백엔드 연결됨' : '샘플 모드'} />
        <SettingRow label="데이터 출처" value="NAVER 우선" />
        <SettingRow
          label="푸시 감시"
          value={pushStatus?.monitorActive ? '서버 실행 중' : '확인 필요'}
        />
        <SettingRow
          label="등록 기기"
          value={pushStatus ? `${pushStatus.registeredDevices}대` : '-'}
        />
        <SettingRow label="배포 방식" value="개인용 APK" />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Android 시스템 알림</Text>
        <Text style={styles.noticeText}>
          EAS 프로젝트와 Android 푸시 자격증명이 설정된 APK에서는 서버가 신규 급등 신호를 감지하면 앱이 백그라운드이거나 종료된 상태에서도 시스템 알림을 보냅니다. 알림을 누르면 급등 탭으로 이동합니다.
        </Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.lg, borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { color: palette.textMuted, fontSize: 14, flex: 1 },
  value: { color: palette.text, fontSize: 14, fontWeight: '800', textAlign: 'right', flex: 1 },
  notice: { backgroundColor: '#3A321C', borderRadius: 16, padding: spacing.lg },
  noticeTitle: { color: palette.warning, fontSize: 13, fontWeight: '900' },
  noticeText: { color: '#D4C8A8', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
});
