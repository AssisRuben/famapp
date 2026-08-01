import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface MetricTileProps {
  label: string;
  value: string;
  accentColor?: string;
  // Sobrescreve a largura padrão de 48% (grade 2 colunas) — usado
  // quando a seção tem um número de tiles que não fecha em pares (ex.:
  // 3 tiles em 1 linha só), pra não sobrar um tile sozinho numa linha
  // com um buraco enorme ao lado.
  style?: StyleProp<ViewStyle>;
  // Só pra ajustes que não sejam fontSize (cor, peso) — o tamanho da
  // fonte do valor é calculado sozinho a partir da largura real do
  // tile (ver calcularFontSizeAjustada abaixo), então não precisa mais
  // passar um fontSize fixo por fora pra cada variante de grade.
  valueStyle?: StyleProp<TextStyle>;
  // Pra valores que não cabem numa linha só mesmo com fonte mínima
  // (ex.: "3.311 de 43.119" num tile de 3 colunas) — default 1, igual
  // sempre foi.
  numberOfLines?: number;
}

const FONTE_MAX = 18;
const FONTE_MIN = 11;
// Largura média de um caractere em fonte bold, como fração do
// font-size — aproximação (não é medição real de glyph), calibrada
// visualmente pra valores tipo "R$ 15.660,00". Suficiente pra evitar
// quebra de linha sem precisar de uma lib de medição de texto.
const FATOR_LARGURA_CARACTERE = 0.58;

// adjustsFontSizeToFit não é confiável no React Native Web (testado:
// trunca o texto em "..." em vez de encolher a fonte) — por isso o
// ajuste é feito na mão, medindo a largura real do tile via onLayout e
// calculando o font-size que cabe pro comprimento do texto. Roda de
// novo sempre que o tile é redimensionado (ex.: rotação de tela, web
// responsivo), então o valor nunca fica cortado nem quebra no meio.
function calcularFontSizeAjustada(larguraDisponivel: number, tamanhoTexto: number, numeroLinhas: number): number {
  if (larguraDisponivel <= 0 || tamanhoTexto === 0) return FONTE_MAX;
  // com mais de 1 linha permitida, cada linha só precisa caber uma
  // fração do texto — aproximação grosseira (não sabe onde a quebra
  // cai de verdade), mas suficiente pra parar de cortar valor longo.
  const caracteresPorLinha = tamanhoTexto / numeroLinhas;
  const fonteQueCabe = Math.floor(larguraDisponivel / (caracteresPorLinha * FATOR_LARGURA_CARACTERE));
  return Math.min(FONTE_MAX, Math.max(FONTE_MIN, fonteQueCabe));
}

export function MetricTile({ label, value, accentColor = colors.navy, style, valueStyle, numberOfLines = 1 }: MetricTileProps) {
  const [larguraTexto, setLarguraTexto] = useState(0);

  const aoMedirLargura = (evento: LayoutChangeEvent) => {
    const largura = evento.nativeEvent.layout.width;
    if (largura !== larguraTexto) setLarguraTexto(largura);
  };

  const fontSizeValor = calcularFontSizeAjustada(larguraTexto, value.length, numberOfLines);

  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.textWrap} onLayout={aoMedirLargura}>
        <Text style={[styles.value, { fontSize: fontSizeValor }, valueStyle]} numberOfLines={numberOfLines}>
          {value}
        </Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    width: '48%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
  textWrap: { flexShrink: 1 },
  value: { fontSize: FONTE_MAX, fontWeight: '700', color: colors.textPrimary },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
