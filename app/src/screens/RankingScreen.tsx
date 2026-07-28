import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { formatBRL, formatDateBR, todayISO } from '../lib/format';
import { RankingVendedorDia } from '../types/domain';
import { colors } from '../theme/colors';

const RUNNER_SIZE = 34;
const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingScreen() {
  const { profile } = useAuth();
  const [ranking, setRanking] = useState<RankingVendedorDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const data = todayISO();

  const animsRef = useRef<Map<number, Animated.Value>>(new Map());

  const load = useCallback(async () => {
    if (!profile) return;
    setRanking(await repository.getRankingVendedoresDia(profile, data));
  }, [profile, data]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const maxFaturamento = useMemo(
    () => ranking.reduce((max, r) => Math.max(max, r.faturamentoLiquido), 0),
    [ranking]
  );

  // Dispara (ou repete, num "replay" a cada refresh) a corrida assim que
  // sabemos a largura da pista e temos o ranking carregado.
  useEffect(() => {
    if (!trackWidth || ranking.length === 0) return;

    const animations = ranking.map((item, index) => {
      let anim = animsRef.current.get(item.codigoVendedor);
      if (!anim) {
        anim = new Animated.Value(0);
        animsRef.current.set(item.codigoVendedor, anim);
      } else {
        anim.setValue(0);
      }
      return Animated.timing(anim, {
        toValue: 1,
        duration: 1100,
        delay: index * 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    });

    Animated.parallel(animations).start();
  }, [trackWidth, ranking]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    if (trackWidth === 0) setTrackWidth(e.nativeEvent.layout.width);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const espacoUtil = Math.max(trackWidth - RUNNER_SIZE - 34, 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>🏁 Corrida de vendas</Text>
      <Text style={styles.subtitle}>{formatDateBR(data)} · ranking completo, visível para todo mundo</Text>

      {ranking.length === 0 ? (
        <Text style={styles.empty}>Sem dados para hoje.</Text>
      ) : (
        ranking.map((item, index) => {
          const anim = animsRef.current.get(item.codigoVendedor) ?? new Animated.Value(0);
          animsRef.current.set(item.codigoVendedor, anim);
          const pct = maxFaturamento ? item.faturamentoLiquido / maxFaturamento : 0;
          const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, espacoUtil * pct] });
          const isMe = profile?.role === 'vendedor' && profile.codigoVendedor === item.codigoVendedor;

          return (
            <View key={item.codigoVendedor} style={[styles.laneWrap, isMe && styles.laneWrapMe]}>
              <View style={styles.laneHeader}>
                <Text style={[styles.laneNome, isMe && styles.laneNomeMe]} numberOfLines={1}>
                  {MEDALS[index] ?? `${index + 1}º`} {item.nomeVendedor}
                  {isMe ? ' · você' : ''}
                </Text>
                <Text style={styles.laneValor}>{formatBRL(item.faturamentoLiquido)}</Text>
              </View>
              <View style={styles.track} onLayout={onTrackLayout}>
                <Animated.View style={[styles.runner, { transform: [{ translateX }] }]}>
                  <Text style={styles.runnerEmoji}>🏃</Text>
                </Animated.View>
                <Text style={styles.flag}>🏁</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
  laneWrap: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  laneWrapMe: {
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  laneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  laneNome: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flexShrink: 1, marginRight: 8 },
  laneNomeMe: { color: colors.navy },
  laneValor: { fontSize: 14, fontWeight: '700', color: colors.success },
  track: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  runner: {
    position: 'absolute',
    left: 5,
    width: RUNNER_SIZE,
    height: RUNNER_SIZE,
    borderRadius: RUNNER_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  runnerEmoji: { fontSize: 18 },
  flag: {
    position: 'absolute',
    right: 8,
    fontSize: 18,
  },
});
