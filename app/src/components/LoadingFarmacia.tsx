import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

// Animação de carregamento lúdica com tema de farmácia (pílula/cruz),
// pra substituir o ActivityIndicator genérico nas telas cujo carregamento
// inicial gate a tela inteira (10/08/2026). Só Animated nativo (sem lib
// externa) — 3 "comprimidos" pulando em sequência, tom azul da marca.
const SIMBOLOS = ['💊', '➕', '💊'];
const ATRASOS = [0, 150, 300];
const CICLO_MS = 900;

function Comprimido({ simbolo, atraso }: { simbolo: string; atraso: number }) {
  const pulo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(atraso),
        Animated.timing(pulo, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulo, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(CICLO_MS - atraso),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [atraso, pulo]);

  const translateY = pulo.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const rotate = pulo.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '20deg'] });
  const scale = pulo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });

  return (
    <View style={styles.circulo}>
      <Animated.Text style={[styles.emoji, { transform: [{ translateY }, { rotate }, { scale }] }]}>
        {simbolo}
      </Animated.Text>
    </View>
  );
}

export function LoadingFarmacia({ legenda = 'Preparando tudo...' }: { legenda?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.fileira}>
        {SIMBOLOS.map((simbolo, i) => (
          <Comprimido key={i} simbolo={simbolo} atraso={ATRASOS[i]} />
        ))}
      </View>
      <Text style={styles.legenda}>{legenda}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  fileira: { flexDirection: 'row', gap: 12 },
  circulo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(11, 74, 143, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  legenda: { marginTop: 16, fontSize: 13, fontWeight: '600', color: colors.navy },
});
