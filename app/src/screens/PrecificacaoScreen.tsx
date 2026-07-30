import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';
import { LIMIAR_DIAS_PARADO } from '../lib/precificacao';
import { ItemPrecificacao, TagPrecificacao } from '../types/domain';

const TAG_INFO: Record<TagPrecificacao, { label: string; cor: string }> = {
  candidato_reajuste: { label: '🔼 Candidato a reajuste', cor: colors.success },
  parado_avaliar_preco: { label: '🐌 Parado — avaliar preço', cor: colors.red },
  baixa_elasticidade: { label: '🔒 Baixa elasticidade', cor: colors.navy },
  alta_elasticidade: { label: '🎯 Alta elasticidade', cor: '#9333ea' },
};

type Filtro = 'sinais' | 'candidato_reajuste' | 'parado_avaliar_preco';

function TagBadge({ tag }: { tag: TagPrecificacao }) {
  const info = TAG_INFO[tag];
  return (
    <View style={[styles.badge, { backgroundColor: info.cor }]}>
      <Text style={styles.badgeTexto}>{info.label}</Text>
    </View>
  );
}

export function PrecificacaoScreen() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<ItemPrecificacao[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('sinais');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setItens(await repository.getRelatorioPrecificacao(profile));
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

  const acionaveis = itens.filter(
    (i) => i.tags.includes('candidato_reajuste') || i.tags.includes('parado_avaliar_preco')
  );
  const visiveis =
    filtro === 'sinais' ? acionaveis : itens.filter((i) => i.tags.includes(filtro));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>📊 Sinais de precificação</Text>
      <Text style={styles.subtitle}>
        Diagnóstico, não decisão: aponta quem merece atenção com base em giro, margem e categoria — o desconto em si
        continua sendo definido na aba Campanhas.
      </Text>

      <Card>
        <Text style={styles.explicacaoParametro}>
          <Text style={styles.explicacaoDestaque}>🐌 Parado: </Text>
          {LIMIAR_DIAS_PARADO} dias ou mais sem venda, mas ainda COM estoque disponível — se faltasse produto o problema
          seria reposição (aba Compras), não preço.
        </Text>
        <Text style={styles.explicacaoParametro}>
          <Text style={styles.explicacaoDestaque}>Elasticidade: </Text>
          não é uma ação, é contexto pra calibrar o quanto testar de variação de preço. 🔒 Baixa elasticidade (hoje só
          "Medicamentos") = uso contínuo/prescrição, cliente tolera menos mudança de preço. 🎯 Alta elasticidade = o
          resto do catálogo, mais perto de conveniência/impulso, reage mais a mudança de preço.
        </Text>
      </Card>

      <View style={styles.filtroRow}>
        {(
          [
            { chave: 'sinais', label: 'Todos os sinais' },
            { chave: 'candidato_reajuste', label: '🔼 Reajuste' },
            { chave: 'parado_avaliar_preco', label: '🐌 Parado' },
          ] as { chave: Filtro; label: string }[]
        ).map((opcao) => (
          <Pressable
            key={opcao.chave}
            style={[styles.filtroChip, filtro === opcao.chave && styles.filtroChipAtivo]}
            onPress={() => setFiltro(opcao.chave)}
          >
            <Text style={[styles.filtroChipTexto, filtro === opcao.chave && styles.filtroChipTextoAtivo]}>
              {opcao.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {visiveis.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nenhum produto com esse sinal no momento.</Text>
        </Card>
      ) : (
        visiveis.map((item) => (
          <Card key={item.produto.codigo}>
            <Text style={styles.itemNome} numberOfLines={2}>{item.produto.nome}</Text>
            <Text style={styles.itemCategoria}>{item.produto.categoria}</Text>

            <View style={styles.badgesRow}>
              {item.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </View>

            <View style={styles.detalhesGrid}>
              <View style={styles.detalheItem}>
                <Text style={styles.detalheLabel}>Giro (30d)</Text>
                <Text style={styles.detalheValor}>{item.quantidadeVendida30d} un.</Text>
              </View>
              <View style={styles.detalheItem}>
                <Text style={styles.detalheLabel}>Dias sem venda</Text>
                <Text style={styles.detalheValor}>{item.diasSemVenda ?? '—'}</Text>
              </View>
              <View style={styles.detalheItem}>
                <Text style={styles.detalheLabel}>Margem atual</Text>
                <Text style={styles.detalheValor}>{item.margemAtualPct.toFixed(1)}%</Text>
              </View>
              <View style={styles.detalheItem}>
                <Text style={styles.detalheLabel}>Preço de venda</Text>
                <Text style={styles.detalheValor}>{formatBRL(item.produto.precoVenda)}</Text>
              </View>
            </View>
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
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  explicacaoParametro: { fontSize: 11, color: colors.textMuted, lineHeight: 15, marginBottom: 6 },
  explicacaoDestaque: { fontWeight: '700', color: colors.textSecondary },
  filtroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filtroChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtroChipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroChipTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  filtroChipTextoAtivo: { color: colors.white },
  itemNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  itemCategoria: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeTexto: { color: colors.white, fontSize: 11, fontWeight: '700' },
  detalhesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detalheItem: { width: '50%', marginBottom: 8 },
  detalheLabel: { fontSize: 11, color: colors.textSecondary },
  detalheValor: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 1 },
});
