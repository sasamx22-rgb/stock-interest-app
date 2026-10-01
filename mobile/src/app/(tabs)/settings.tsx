import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import {
  getAiStatus,
  isDemoMode,
  isLiveDataConfigured,
} from '@/lib/market-api';
import { AiStatus } from '@/types/market';

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

export default function SettingsScreen() {
  const loadGeneration = useRef(0);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    const requestId = ++loadGeneration.current;
    setMessage('');

    getAiStatus()
      .then((currentAiStatus) => {
        if (requestId !== loadGeneration.current) return;
        setAiStatus(currentAiStatus);
      })
      .catch(() => {
        if (requestId === loadGeneration.current) {
          setMessage('설정 정보를 불러오지 못했습니다. 서버 연결을 확인해주세요.');
        }
      });

    return () => {
      loadGeneration.current += 1;
    };
  }, []));

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>PREFERENCES</Text>
        <Text style={styles.heading}>설정</Text>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.card}>
        <SettingRow label="대상 시장" value="한국 · 미국" />
        <SettingRow
          label="데이터 연결"
          value={isLiveDataConfigured() ? '백엔드 연결됨' : isDemoMode() ? '샘플 모드' : '연결 설정 필요'}
        />
        <SettingRow label="시세 출처" value="NAVER 우선" />
        <SettingRow label="급등 알림" value="첫 버전 미사용" />
        <SettingRow label="원격 푸시" value="비활성" />
      </View>

      <View style={styles.card}>
        <SettingRow label="AI 분석" value={aiStatus?.enabled ? '사용 중' : '비활성'} />
        <SettingRow label="AI 모델" value={aiStatus?.model ?? 'gpt-5.6-terra'} />
        <SettingRow
          label="오늘 AI 호출"
          value={aiStatus?.enabled
            ? `${aiStatus.callsToday} / ${aiStatus.dailyLimit}회`
            : 'API 키 미설정'}
        />
        <SettingRow label="AI 사용 범위" value="종목 변동 원인" />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>급등 알림은 후속 기능</Text>
        <Text style={styles.noticeText}>
          첫 버전에서는 전체시장 커버리지와 거래량 배수 기준이 충분히 검증되지 않아 급등 탐지와 푸시를 사용하지 않습니다.
          관심종목, 보고서, 뉴스, 일정과 가격 흐름을 중심으로 제공합니다.
        </Text>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>투자 참고용</Text>
        <Text style={styles.noticeText}>
          표시된 시세·뉴스·일정은 외부 데이터 공급 상태에 따라 지연되거나 일부 누락될 수 있으며 투자 판단의 유일한 근거로 사용할 수 없습니다.
        </Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  message: { color: palette.warning, fontSize: 12, lineHeight: 18 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    borderColor: palette.border,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { color: palette.textMuted, fontSize: 14, flex: 1 },
  value: { color: palette.text, fontSize: 14, fontWeight: '800', textAlign: 'right', flex: 1 },
  notice: { backgroundColor: '#3A321C', borderRadius: 16, padding: spacing.lg },
  noticeTitle: { color: palette.warning, fontSize: 13, fontWeight: '900' },
  noticeText: { color: '#D4C8A8', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
});
