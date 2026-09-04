import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';

interface ComparativoCustoVendaProps {
  custo: number;
  venda: number;
  // Texto pequeno acima dos valores (ex.: "por kit", "por unidade") —
  // esclarece o que "custo"/"venda" representam quando não é óbvio
  // pelo contexto (kit com quantidade > 1, por exemplo).
  legenda?: string;
}

// Comparativo visual custo → venda → lucro (02/09/2026) — pedido
// explícito: "preciso que fique mais claro o lucro por kit" — um
// número de margem em % sozinho não deixava claro se tinha lucro de
// verdade. Usado nos 3 lugares que editam preço de kit (Cartazetes
// produto único/multi-produto, Sugestão de kits) — atualiza ao vivo
// junto com o campo de percentual/preço fixo, já que recebe só os
// dois números finais, não recalcula nada sozinho.
export function ComparativoCustoVenda({ custo, venda, legenda }: ComparativoCustoVendaProps) {
  const lucro = venda - custo;
  const margemPct = venda > 0 ? (lucro / venda) * 100 : 0;
  const lucroPositivo = lucro >= 0;

  return (
    <View style={styles.container}>
      {legenda ? <Text style={styles.legenda}>{legenda}</Text> : null}
      <View style={styles.linha}>
        <View style={styles.coluna}>
          <Text style={styles.rotulo}>Custo</Text>
          <Text style={styles.valor}>{formatBRL(custo)}</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.textMuted} style={styles.seta} />
        <View style={styles.coluna}>
          <Text style={styles.rotulo}>Venda</Text>
          <Text style={styles.valor}>{formatBRL(venda)}</Text>
        </View>
        <View style={[styles.coluna, styles.colunaLucro]}>
          <Text style={styles.rotulo}>Lucro</Text>
          <Text style={[styles.valorLucro, !lucroPositivo && styles.valorLucroNegativo]}>
            {lucroPositivo ? '+' : ''}
            {formatBRL(lucro)}
          </Text>
          <Text style={[styles.margemPct, !lucroPositivo && styles.valorLucroNegativo]}>
            {margemPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de margem
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  legenda: { fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  linha: { flexDirection: 'row', alignItems: 'center' },
  coluna: { alignItems: 'flex-start' },
  colunaLucro: { marginLeft: 'auto', alignItems: 'flex-end' },
  seta: { marginHorizontal: 10 },
  rotulo: { fontSize: 10, color: colors.textMuted, marginBottom: 2 },
  valor: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  valorLucro: { fontSize: 16, fontWeight: '800', color: colors.success },
  valorLucroNegativo: { color: colors.red },
  margemPct: { fontSize: 11, fontWeight: '600', color: colors.success, marginTop: 1 },
});
