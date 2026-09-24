import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenShell } from '@/components/screen-shell';
import { palette, spacing } from '@/constants/market-theme';
import {
  addWatchlistItem,
  getWatchlistItems,
  removeWatchlistItem,
  searchStocks,
} from '@/lib/market-api';
import { StockSearchResult, WatchlistItem } from '@/types/market';

function displaySymbol(item: WatchlistItem) {
  return item.market === 'US' ? item.code.split('.')[0] : item.code;
}

export default function WatchlistScreen() {
  const listGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadWatchlist = useCallback(async () => {
    const requestId = ++listGeneration.current;
    setLoadingList(true);
    try {
      const items = await getWatchlistItems();
      if (requestId !== listGeneration.current) return false;
      setWatchlist(items);
      return true;
    } catch {
      if (requestId === listGeneration.current) {
        setMessage('관심종목을 불러오지 못했습니다. 서버 연결을 확인해주세요.');
      }
      return false;
    } finally {
      if (requestId === listGeneration.current) setLoadingList(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadWatchlist();
    return () => {
      listGeneration.current += 1;
      searchGeneration.current += 1;
    };
  }, [loadWatchlist]));

  const submitSearch = async () => {
    const clean = query.trim();
    if (!clean) return;

    const requestId = ++searchGeneration.current;
    setSearching(true);
    setMessage('');
    try {
      const nextResults = await searchStocks(clean);
      if (requestId !== searchGeneration.current) return;
      setResults(nextResults);
      if (nextResults.length === 0) setMessage('검색 결과가 없습니다.');
    } catch {
      if (requestId === searchGeneration.current) {
        setMessage('종목 검색에 실패했습니다. 서버 연결을 확인해주세요.');
      }
    } finally {
      if (requestId === searchGeneration.current) setSearching(false);
    }
  };

  const addItem = async (item: StockSearchResult) => {
    const key = `${item.market}:${item.code}`;
    setPendingKey(key);
    setMessage('');
    try {
      await addWatchlistItem(item);
      const refreshed = await loadWatchlist();
      setMessage(refreshed
        ? `${item.name}을(를) 관심종목에 추가했습니다.`
        : `${item.name} 추가는 완료됐지만 목록 새로고침에 실패했습니다.`);
    } catch {
      setMessage('관심종목 추가에 실패했습니다.');
    } finally {
      setPendingKey(null);
    }
  };

  const removeItem = async (item: WatchlistItem) => {
    const key = `${item.market}:${item.code}`;
    setPendingKey(key);
    setMessage('');
    try {
      await removeWatchlistItem(item);
      const refreshed = await loadWatchlist();
      setMessage(refreshed
        ? `${item.name}을(를) 관심종목에서 삭제했습니다.`
        : `${item.name} 삭제는 완료됐지만 목록 새로고침에 실패했습니다.`);
    } catch {
      setMessage('관심종목 삭제에 실패했습니다.');
    } finally {
      setPendingKey(null);
    }
  };

  const existing = new Set(watchlist.map((item) => `${item.market}:${item.code}`));

  return (
    <ScreenShell>
      <View>
        <Text style={styles.eyebrow}>WATCHLIST</Text>
        <Text style={styles.heading}>관심종목</Text>
        <Text style={styles.description}>한국·미국 종목을 검색하고 관심종목을 직접 관리합니다.</Text>
      </View>

      <View style={styles.searchCard}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="삼성전자, NVDA, Apple..."
          placeholderTextColor={palette.textMuted}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitSearch}
          style={styles.input}
        />
        <Pressable onPress={submitSearch} style={styles.searchButton}>
          <Text style={styles.searchButtonText}>검색</Text>
        </Pressable>
      </View>

      {searching ? <ActivityIndicator color={palette.primary} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {results.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>검색 결과</Text>
          <View style={styles.card}>
            {results.map((item) => {
              const key = `${item.market}:${item.code}`;
              const added = existing.has(key);
              const pending = pendingKey === key;
              return (
                <View key={key} style={styles.row}>
                  <View style={styles.identity}>
                    <View style={styles.badge}><Text style={styles.badgeText}>{item.market}</Text></View>
                    <View style={styles.nameBlock}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.symbol}>{item.symbol}</Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={added || pending}
                    onPress={() => addItem(item)}
                    style={[styles.actionButton, added && styles.actionButtonDisabled]}>
                    <Text style={[styles.actionText, added && styles.actionTextDisabled]}>
                      {pending ? '추가 중' : added ? '추가됨' : '+ 추가'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>내 관심종목</Text>
          <Text style={styles.count}>{watchlist.length}개</Text>
        </View>

        {loadingList ? <ActivityIndicator color={palette.primary} /> : null}

        {!loadingList && watchlist.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>관심종목이 없습니다.</Text>
            <Text style={styles.emptyText}>위 검색창에서 종목을 찾아 추가해보세요.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {watchlist.map((item) => {
              const key = `${item.market}:${item.code}`;
              return (
                <View key={key} style={styles.row}>
                  <View style={styles.identity}>
                    <View style={styles.badge}><Text style={styles.badgeText}>{item.market}</Text></View>
                    <View style={styles.nameBlock}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.symbol}>{displaySymbol(item)}</Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={pendingKey === key}
                    onPress={() => removeItem(item)}
                    style={styles.removeButton}>
                    <Text style={styles.removeText}>{pendingKey === key ? '삭제 중' : '삭제'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  heading: { color: palette.text, fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  description: { color: palette.textMuted, fontSize: 14, marginTop: spacing.sm, lineHeight: 20 },
  searchCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
  },
  input: {
    flex: 1,
    minHeight: 48,
    color: palette.text,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  searchButton: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: palette.primary,
  },
  searchButtonText: { color: palette.background, fontWeight: '900', fontSize: 14 },
  message: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  count: { color: palette.textMuted, fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
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
  name: { color: palette.text, fontSize: 14, fontWeight: '800' },
  symbol: { color: palette.textMuted, fontSize: 12, marginTop: 4 },
  actionButton: {
    backgroundColor: palette.primaryMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionButtonDisabled: { backgroundColor: palette.surfaceRaised },
  actionText: { color: palette.primary, fontSize: 12, fontWeight: '900' },
  actionTextDisabled: { color: palette.textMuted },
  removeButton: {
    backgroundColor: '#3D1E2B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeText: { color: palette.gain, fontSize: 12, fontWeight: '900' },
  empty: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: palette.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
});
