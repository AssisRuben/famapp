import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { MetricTile } from '../components/MetricTile';
import { MetaProgressBar } from '../components/MetaProgressBar';
import { PeriodoMeta, PeriodoMetaSelector } from '../components/PeriodoMetaSelector';
import { formatBRL, formatBRLSemCentavos, formatDateHoraBR, todayISO } from '../lib/format';
import { metaDiaria, semanaDoDia } from '../lib/metas';
import {
  ClienteInatividade,
  DesempenhoVendedorDiario,
  MetaVendedor,
  MetricasVendedorDiario,
  StatusSincronizacao,
} from '../types/domain';
import { colors } from '../theme/colors';

function valoresDaMeta(
  meta: MetaVendedor,
  periodo: PeriodoMeta,
  realizadoHoje: number,
  semanaAtual: number
): { label: string; valorMeta: number; valorRealizado: number } {
  if (periodo === 'dia') {
    return {
      label: 'Meta do dia',
      valorMeta: metaDiaria(meta.valorMetaMensal, meta.ano, meta.mes),
      valorRealizado: realizadoHoje,
    };
  }
  if (periodo === 'semana') {
    const semana = meta.semanas.find((s) => s.semana === semanaAtual);
    return {
      label: `Meta da semana (${semana?.rotulo ?? ''})`,
      valorMeta: semana?.valorMeta ?? 0,
      valorRealizado: semana?.valorRealizado ?? 0,
    };
  }
  return { label: 'Meta do mês', valorMeta: meta.valorMetaMensal, valorRealizado: meta.valorRealizadoMensal };
}

export function DashboardScreen() {
  const { profile } = useAuth();
  const [metricas, setMetricas] = useState<MetricasVendedorDiario[]>([]);
  const [desempenho, setDesempenho] = useState<DesempenhoVendedorDiario[]>([]);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [statusSync, setStatusSync] = useState<StatusSincronizacao[]>([]);
  const [clientesInatividade, setClientesInatividade] = useState<ClienteInatividade[]>([]);
  const [periodoMeta, setPeriodoMeta] = useState<PeriodoMeta>('mes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const data = todayISO();
  const hoje = new Date();

  const load = useCallback(async () => {
    if (!profile) return;
    const ehGestor = profile.role === 'gestor';
    const [m, d, mt, ss, ci] = await Promise.all([
      repository.getMetricasVendedorDiario(profile, data),
      repository.getDesempenhoVendedorDiario(profile, data),
      repository.getMetas(profile, hoje.getFullYear(), hoje.getMonth() + 1),
      repository.getStatusSincronizacao(),
      // só o gestor vê o card de clientes inativos — evita a chamada à
      // toa pro vendedor, que não usa esse dado no Dashboard.
      ehGestor ? repository.getClientesInatividade(profile) : Promise.resolve([]),
    ]);
    setMetricas(m);
    setDesempenho(d);
    setMetas(mt);
    setStatusSync(ss);
    setClientesInatividade(ci);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const totalFaturamento = sum(metricas, (m) => m.faturamentoLiquido);
  const totalBruto = sum(metricas, (m) => m.faturamentoBruto);
  const totalDesconto = sum(metricas, (m) => m.totalDesconto);
  const totalComissao = sum(metricas, (m) => m.comissaoEstimada);
  const totalCusto = sum(metricas, (m) => m.totalCusto);
  const totalNotas = sum(metricas, (m) => m.qtdNotas);
  const totalItens = sum(desempenho, (d) => d.quantidadeItens);
  const totalAtendimentos = sum(desempenho, (d) => d.quantidadeAtendimentos);

  const ticketMedio = totalNotas ? totalFaturamento / totalNotas : 0;
  const taxaDesconto = totalBruto ? (totalDesconto / totalBruto) * 100 : 0;
  const margemBruta = totalFaturamento ? ((totalFaturamento - totalCusto) / totalFaturamento) * 100 : 0;
  const itensPorAtendimento = totalAtendimentos ? totalItens / totalAtendimentos : 0;
  const clientesInativos = clientesInatividade.filter((c) => c.inativo).length;
  const semanaAtual = semanaDoDia(hoje.getDate());
  const realizadoHojePorVendedor = new Map(metricas.map((m) => [m.codigoVendedor, m.faturamentoLiquido]));

  // mostra a sincronização mais ANTIGA entre as entidades — é o pior
  // caso de "quão desatualizado" algum dado pode estar.
  const timestampsSync = statusSync
    .map((s) => s.ultimaSincronizacao)
    .filter((t): t is string => t != null)
    .sort();
  const ultimaSincronizacao = timestampsSync[0] ?? null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Olá, {profile?.nome}</Text>
      {ultimaSincronizacao && (
        <Text style={styles.syncLabel}>🔄 Dados sincronizados em {formatDateHoraBR(ultimaSincronizacao)}</Text>
      )}

      {metricas.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Sem vendas registradas hoje.</Text>
        </Card>
      ) : (
        <View style={styles.tileRow}>
          <MetricTile label="Faturamento líquido" value={formatBRL(totalFaturamento)} accentColor={colors.success} />
          <MetricTile label="Ticket médio" value={formatBRL(ticketMedio)} accentColor={colors.navy} />
          <MetricTile label="Itens / atendimento" value={itensPorAtendimento.toFixed(2)} accentColor="#9333ea" />
          <MetricTile label="Taxa de desconto" value={`${taxaDesconto.toFixed(2)}%`} accentColor={colors.red} />
          <MetricTile label="Comissão estimada" value={formatBRL(totalComissao)} accentColor="#0891b2" />
          <MetricTile label="Notas emitidas" value={String(totalNotas)} accentColor={colors.textSecondary} />
        </View>
      )}

      {profile?.role === 'gestor' && (
        <Card>
          <Text style={styles.sectionTitle}>📈 Indicadores de gestão</Text>
          <View style={styles.tileRowTresColunas}>
            <MetricTile
              style={styles.tileTercoColuna}
              label="Valor de vendas (bruto)"
              value={formatBRLSemCentavos(totalBruto)}
              accentColor={colors.navy}
            />
            <MetricTile
              style={styles.tileTercoColuna}
              label="Margem bruta"
              value={`${margemBruta.toFixed(2)}%`}
              accentColor={margemBruta < 30 ? colors.red : colors.success}
            />
            <MetricTile
              style={styles.tileTercoColuna}
              label="Clientes inativos"
              value={`${clientesInativos} de ${clientesInatividade.length}`}
              accentColor={colors.red}
            />
          </View>
        </Card>
      )}

      {metas.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>🎯 Metas</Text>
          <PeriodoMetaSelector value={periodoMeta} onChange={setPeriodoMeta} />
          {profile?.role === 'gestor' ? (
            metas
              .slice()
              .map((meta) => ({
                meta,
                valores: valoresDaMeta(meta, periodoMeta, realizadoHojePorVendedor.get(meta.codigoVendedor) ?? 0, semanaAtual),
              }))
              .sort((a, b) => b.valores.valorRealizado / (b.valores.valorMeta || 1) - a.valores.valorRealizado / (a.valores.valorMeta || 1))
              .map(({ meta, valores }) => (
                <MetaProgressBar
                  key={meta.codigoVendedor}
                  label={meta.nomeVendedor}
                  valorRealizado={valores.valorRealizado}
                  valorMeta={valores.valorMeta}
                />
              ))
          ) : (
            metas
              .filter((m) => m.codigoVendedor === profile?.codigoVendedor)
              .map((meta) => {
                const valores = valoresDaMeta(meta, periodoMeta, realizadoHojePorVendedor.get(meta.codigoVendedor) ?? 0, semanaAtual);
                return (
                  <MetaProgressBar
                    key={meta.codigoVendedor}
                    label={valores.label}
                    valorRealizado={valores.valorRealizado}
                    valorMeta={valores.valorMeta}
                  />
                );
              })
          )}
        </Card>
      )}

      {profile?.role === 'gestor' && metricas.length > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>Por vendedor</Text>
          {metricas
            .slice()
            .sort((a, b) => b.faturamentoLiquido - a.faturamentoLiquido)
            .map((m) => (
              <View key={m.codigoVendedor} style={styles.vendedorRow}>
                <Text style={styles.vendedorNome}>{m.nomeVendedor}</Text>
                <View style={styles.vendedorValores}>
                  <Text style={styles.vendedorValor}>{formatBRL(m.faturamentoLiquido)}</Text>
                  <Text style={styles.vendedorMargem}>margem {m.margemBrutaPct.toFixed(1)}%</Text>
                </View>
              </View>
            ))}
        </Card>
      )}
    </ScrollView>
  );
}

function sum<T>(arr: T[], pick: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + pick(item), 0);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  syncLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 16 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  // 3 indicadores cabem numa linha só — evita o problema do grid de 2
  // colunas com número ímpar de tiles (o 3º sobra sozinho numa linha
  // nova, alinhado à esquerda com um vão enorme à direita).
  tileRowTresColunas: { flexDirection: 'row', justifyContent: 'space-between' },
  tileTercoColuna: { width: '31%', paddingHorizontal: 8 },
  empty: { color: colors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 10 },
  vendedorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  vendedorNome: { color: colors.textSecondary },
  vendedorValores: { alignItems: 'flex-end' },
  vendedorValor: { color: colors.textPrimary, fontWeight: '600' },
  vendedorMargem: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
});
