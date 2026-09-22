import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import {
  getAiStatus,
  getAlertSettings,
  getPushStatus,
  isLiveDataConfigured,
  updateAlertSettings,
} from '@/lib/market-api';
import { AiStatus, AlertRule, PushStatus } from '@/types/market';

const CHANGE_OPTIONS = [3, 5, 7, 10];
const VOLUME_OPTIONS = [2, 3, 4, 5];

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

function RuleSelector({
  title,
  options,
  value,
  suffix,
  disabled,
  onSelect,
}: {
  title: string;
  options: number[];
  value: number;
  suffix: string;
  disabled: boolean;
  onSelect: (value: number) => void;
}) {
  return (
    <View style={styles.ruleBlock}>
      <View style={styles.ruleHeader}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleValue}>{value}{suffix}</Text>
      </View>
      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              disabled={disabled}
              onPress={() => onSelect(option)}
              style={[styles.option, selected && styles.optionSelected]}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option}{suffix}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [rule, setRule] = useState<AlertRule>({ changePercent: 5, volumeRatio: 3 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([
      getPushStatus().catch(() => null),
      getAlertSettings(),
      getAiStatus(),
    ]).then(([status, currentRule, currentAiStatus]) => {
      if (!active) return;
      setPushStatus(status);
      setRule(currentRule);
      setAiStatus(currentAiStatus);
    });

    return () => {
      active = false;
    };
  }, []));

  const saveRule = async (nextRule: AlertRule) => {
    setSaving(true);
    setMessage('');
    try {
      const saved = await updateAlertSettings(nextRule);
      setRule(saved);
      setMessage('급등 알림 기준을 저장했습니다.');
    } catch {
      setMessage('알림 기준 저장에 실패했습니다. 서버 연결을 확인해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>PREFERENCES</Text>
        <Text style={styles.heading}>설정</Text>
      </View>

      <View style={styles.ruleCard}>
        <View>
          <Text style={styles.cardTitle}>급등 알림 기준</Text>
          <Text style={styles.cardCaption}>
            변경한 기준은 급등 화면과 서버의 원격 푸시 판정에 동시에 적용됩니다.
          </Text>
        </View>

        <RuleSelector
          title="상승률"
          options={CHANGE_OPTIONS}
          value={rule.changePercent}
          suffix="%"
          disabled={saving}
          onSelect={(changePercent) => saveRule({ ...rule, changePercent })}
        />

        <RuleSelector
          title="거래량"
          options={VOLUME_OPTIONS}
          value={rule.volumeRatio}
          suffix="배"
          disabled={saving}
          onSelect={(volumeRatio) => saveRule({ ...rule, volumeRatio })}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      <View style={styles.card}>
        <SettingRow label="대상 시장" value="한국 · 미국" />
        <SettingRow
          label="서버 감시 주기"
          value={pushStatus ? `${Math.round(pushStatus.intervalSeconds / 60)}분` : '2분'}
        />
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
        <Text style={styles.noticeTitle}>Android 시스템 알림</Text>
        <Text style={styles.noticeText}>
          EAS 프로젝트와 Android 푸시 자격증명이 설정된 APK에서는 서버가 신규 급등 신호를 감지하면 앱이 백그라운드이거나 종료된 상태에서도 시스템 알림을 보냅니다.
        </Text>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>투자 참고용</Text>
        <Text style={styles.noticeText}>
          표시된 정보와 거래량 배수 추정치는 지연되거나 오류가 있을 수 있으며 투자 판단의 유일한 근거로 사용할 수 없습니다.
        </Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  ruleCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.lg,
    borderColor: palette.border,
    borderWidth: 1,
    gap: spacing.lg,
  },
  cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  cardCaption: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  ruleBlock: { gap: spacing.sm },
  ruleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ruleTitle: { color: palette.textMuted, fontSize: 13, fontWeight: '700' },
  ruleValue: { color: palette.primary, fontSize: 14, fontWeight: '900' },
  optionRow: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: palette.surfaceRaised,
  },
  optionSelected: { backgroundColor: palette.primary },
  optionText: { color: palette.textMuted, fontSize: 12, fontWeight: '800' },
  optionTextSelected: { color: palette.background },
  message: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
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
