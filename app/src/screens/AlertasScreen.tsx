import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR } from '../lib/format';
import { ProdutoPromocaoAlerta } from '../types/domain';

function mensagemPromocao(alerta: ProdutoPromocaoAlerta, nomeCliente: string, ultimaCompra: string): string {
  const { produto } = alerta;
  return `Olá, ${nomeCliente}! 🎉 O ${produto.nome}, que você já levou aqui na Conviva (última vez em ${formatDateBR(
    ultimaCompra
  )}), entrou em promoção: -${produto.percentualDesconto}% — agora por ${formatBRL(
    produto.precoAtual
  )}. Aproveita antes que acabe!`;
}

export function AlertasScreen() {
  const { profile } = useAuth();
  const [alertas, setAlertas] = useState<ProdutoPromocaoAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setAlertas(await repository.getProdutosEmPromocao(profile));
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>🔔 Alertas de promoção</Text>
      <Text style={styles.subtitle}>
        Produtos que entraram em promoção e clientes que já compraram antes — ótima chance de reativação.
      </Text>

      {alertas.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nenhum produto em promoção no momento.</Text>
        </Card>
      ) : (
        alertas.map((alerta) => (
          <Card key={alerta.produto.codigo}>
            <View style={styles.headerRow}>
              <Text style={styles.produtoNome}>{alerta.produto.nome}</Text>
              <View style={styles.descontoBadge}>
                <Text style={styles.descontoBadgeText}>-{alerta.produto.percentualDesconto}%</Text>
              </View>
            </View>

            <View style={styles.precoRow}>
              {alerta.produto.precoAnterior != null && (
                <Text style={styles.precoAnterior}>{formatBRL(alerta.produto.precoAnterior)}</Text>
              )}
              <Text style={styles.precoAtual}>{formatBRL(alerta.produto.precoAtual)}</Text>
            </View>

            {alerta.clientes.length > 0 && (
              <View style={styles.clientesSection}>
                <Text style={styles.clientesTitle}>
                  Já compraram antes ({alerta.clientes.length})
                </Text>
                {alerta.clientes.map((cliente) => (
                  <View key={cliente.codigoCliente} style={styles.clienteRow}>
                    <View style={styles.clienteInfo}>
                      <Text style={styles.clienteNome}>{cliente.nomeCliente}</Text>
                      <Text style={styles.clienteDetalhe}>
                        Última vez em {formatDateBR(cliente.ultimaCompraProduto)}
                      </Text>
                    </View>
                    {cliente.telefone && (
                      <WhatsAppButton
                        compact
                        telefone={cliente.telefone}
                        mensagem={mensagemPromocao(alerta, cliente.nomeCliente, cliente.ultimaCompraProduto)}
                      />
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  produtoNome: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, flexShrink: 1, marginRight: 8 },
  descontoBadge: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  descontoBadgeText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  precoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 4 },
  precoAnterior: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through' },
  precoAtual: { fontSize: 18, fontWeight: '700', color: colors.success },
  clientesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clientesTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  clienteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 10,
  },
  clienteInfo: { flexShrink: 1 },
  clienteNome: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  clienteDetalhe: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
