import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { formatBRL } from '../lib/format';
import { colors } from '../theme/colors';

const RUNNER_SIZE = 34;
// Espaço reservado à direita pra bandeira + sombra do bonequinho não se
// tocarem quando o 1º lugar chega em pct=1 (sempre acontece, não é
// intermitente) — antes reaproveitava o valor de RUNNER_SIZE aqui, que
// deixava só ~1px de folga real e fazia o bonequinho colidir com 🏁.
const MARGEM_CHEGADA = 40;
const MEDALS = ['🥇', '🥈', '🥉'];

export interface ItemCorrida {
  codigoVendedor: number;
  nomeVendedor: string;
  valor: number;
}

interface CorridaDeVendasProps {
  ranking: ItemCorrida[];
  meuCodigoVendedor?: number | null;
  vazio?: string;
}

// Extraído de RankingScreen (era uma tela própria — 01/08/2026 virou
// parte do card "Ranking" do Painel, com Dia/Semana/Mês em vez de só
// hoje). Mesmo layout/animação de antes, só trocando a fonte do
// ranking pro que o Painel já busca (metricas/metricasSemana/metricasMes).
export function CorridaDeVendas({ ranking, meuCodigoVendedor, vazio = 'Sem dados para este período.' }: CorridaDeVendasProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animsRef = useRef<Map<number, Animated.Value>>(new Map());

  const maxValor = useMemo(
    () => ranking.reduce((max, r) => Math.max(max, r.valor), 0),
    [ranking]
  );

  useEffect(() => {
    if (!trackWidth || ranking.length === 0) return;

    const codigosAtuais = new Set(ranking.map((item) => item.codigoVendedor));
    for (const codigo of animsRef.current.keys()) {
      if (!codigosAtuais.has(codigo)) animsRef.current.delete(codigo);
    }

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

  if (ranking.length === 0) {
    return <Text style={styles.empty}>{vazio}</Text>;
  }

  const espacoUtil = Math.max(trackWidth - RUNNER_SIZE - MARGEM_CHEGADA, 0);

  return (
    <View>
      {ranking.map((item, index) => {
        const anim = animsRef.current.get(item.codigoVendedor) ?? new Animated.Value(0);
        const pct = maxValor ? item.valor / maxValor : 0;
        const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, espacoUtil * pct] });
        const isMe = meuCodigoVendedor != null && meuCodigoVendedor === item.codigoVendedor;

        return (
          <View key={item.codigoVendedor} style={[styles.laneWrap, isMe && styles.laneWrapMe]}>
            <View style={styles.laneHeader}>
              <Text style={[styles.laneNome, isMe && styles.laneNomeMe]} numberOfLines={1}>
                {MEDALS[index] ?? `${index + 1}º`} {item.nomeVendedor}
                {isMe ? ' · você' : ''}
              </Text>
              <Text style={styles.laneValor}>{formatBRL(item.valor)}</Text>
            </View>
            <View style={styles.track} onLayout={onTrackLayout}>
              <Animated.View style={[styles.runner, { transform: [{ translateX }] }]}>
                <Text style={styles.runnerEmoji}>🏃</Text>
              </Animated.View>
              <Text style={styles.flag}>🏁</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textSecondary },
  laneWrap: {
    backgroundColor: colors.background,
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
    backgroundColor: colors.white,
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
