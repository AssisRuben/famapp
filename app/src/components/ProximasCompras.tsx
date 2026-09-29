import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { quandoPrevisto } from '../lib/recompra';
import { ProdutoRecorrenteCliente } from '../types/domain';

interface Props {
  // já filtrado/ordenado por proximasCompras (lib/recompra.ts)
  recompras: ProdutoRecorrenteCliente[];
}

// Seção "Próximas compras prováveis" no painel aberto do cliente (Meus
// clientes / Clientes), acima de "Últimas compras" — o vendedor vê o que
// oferecer antes de ligar (30/09/2026). Não mostra nada se o cliente não
// tem uso contínuo com previsão.
export function ProximasCompras({ recompras }: Props) {
  if (recompras.length === 0) return null;
  return (
    <View style={styles.bloco}>
      <Text style={styles.titulo}>Próximas compras prováveis</Text>
      {recompras.map((p) => {
        const d = p.diasParaPrevisao ?? 0;
        return (
          <View key={p.codigoProduto} style={styles.linha}>
            <Text style={styles.produto} numberOfLines={1}>
              🔁 {p.nomeProduto}
            </Text>
            <Text style={[styles.quando, d <= 0 && styles.quandoAgora]}>
              {quandoPrevisto(d)}
              {p.exigeReceita ? ' · só lembrete' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { marginBottom: 10 },
  titulo: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  produto: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  quando: { fontSize: 12, color: colors.textSecondary },
  quandoAgora: { color: colors.red, fontWeight: '600' },
});
