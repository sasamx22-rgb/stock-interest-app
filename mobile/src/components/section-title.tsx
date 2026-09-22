import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/market-theme';

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: palette.text, fontSize: 18, fontWeight: '800' },
  action: { color: palette.primary, fontSize: 13, fontWeight: '700' },
});
