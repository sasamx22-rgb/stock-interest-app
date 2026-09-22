import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/market-theme';
import { Quote } from '@/types/market';

function formatPrice(quote: Quote) {
  return quote.currency === 'KRW'
    ? `${Math.round(quote.price).toLocaleString('ko-KR')}원`
    : `$${quote.price.toFixed(2)}`;
}

export function QuoteRow({ quote }: { quote: Quote }) {
  const positive = quote.changePercent >= 0;
  const naverUrl = quote.market === 'KR'
    ? `https://stock.naver.com/domestic/stock/${quote.naverCode}/total`
    : `https://stock.naver.com/worldstock/stock/${quote.naverCode}/total`;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(naverUrl)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.identity}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{quote.market}</Text>
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{quote.name}</Text>
          <Text style={styles.symbol}>{quote.symbol}</Text>
        </View>
      </View>
      <View style={styles.priceBlock}>
        <Text style={styles.price}>{formatPrice(quote)}</Text>
        <Text style={[styles.change, { color: positive ? palette.gain : palette.loss }]}>
          {positive ? '+' : ''}{quote.changePercent.toFixed(2)}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.66 },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  badgeText: { color: palette.primary, fontSize: 11, fontWeight: '900' },
  nameBlock: { flex: 1 },
  name: { color: palette.text, fontSize: 15, fontWeight: '800' },
  symbol: { color: palette.textMuted, fontSize: 12, marginTop: 3 },
  priceBlock: { alignItems: 'flex-end' },
  price: { color: palette.text, fontSize: 15, fontWeight: '800' },
  change: { fontSize: 13, fontWeight: '800', marginTop: 4 },
});
