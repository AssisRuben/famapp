import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { MetricTile } from '../components/MetricTile';
import { MetaProgressBar } from '../components/MetaProgressBar';
import { CorridaDeVendas } from '../components/CorridaDeVendas';
import { PeriodoMeta, PeriodoMetaSelector } from '../components/PeriodoMetaSelector';
import { formatBRL, formatBRLSemCentavos, formatDateHoraBR, todayISO } from '../lib/format';
import { diasDecorridosNaSemana, faixaComissaoPara, metaDiaria, semanaDoDia } from '../lib/metas';
import {
  ComissaoMensal,
  DesempenhoVendedorDiario,
  DesempenhoVendedorMensal,
  DesempenhoVendedorSemanal,
  FaixaComissao,
  MetaVendedor,
  MetricasVendedorDiario,
  MetricasVendedorMensal,
  MetricasVendedorSemanal,
  ResumoClientesInatividade,
  StatusSincronizacao,
} from '../types/domain';
import { colors } from '../theme/colors';

function valoresDaMeta(
  meta: MetaVendedor,
  periodo: PeriodoMeta,
  realizadoHoje: number,
  semanaAtual: number
): { label: string; valorMeta: number; valorRealizado: number } {
  // Meta é de margem bruta em R$, não faturamento (01/08/2026) — label
  // deixa isso explícito pra não confundir com meta de venda.
  if (periodo === 'dia') {
    return {
      label: 'Meta de margem do dia',
      valorMeta: metaDiaria(meta.valorMetaMensal, meta.ano, meta.mes),
      valorRealizado: realizadoHoje,
    };
  }
  if (periodo === 'semana') {
    const semana = meta.semanas.find((s) => s.semana === semanaAtual);
    return {
      label: `Meta de margem da semana (${semana?.rotulo ?? ''})`,
      valorMeta: semana?.valorMeta ?? 0,
      valorRealizado: semana?.valorRealizado ?? 0,
    };
  }
  return { label: 'Meta de margem do mês', valorMeta: meta.valorMetaMensal, valorRealizado: meta.valorRealizadoMensal };
}

export function DashboardScreen() {
  const { profile } = useAuth();
  const [metricas, setMetricas] = useState<MetricasVendedorDiario[]>([]);
  const [desempenho, setDesempenho] = useState<DesempenhoVendedorDiario[]>([]);
  const [metricasMes, setMetricasMes] = useState<MetricasVendedorMensal[]>([]);
  const [desempenhoMes, setDesempenhoMes] = useState<DesempenhoVendedorMensal[]>([]);
  const [metricasSemana, setMetricasSemana] = useState<MetricasVendedorSemanal[]>([]);
  const [desempenhoSemana, setDesempenhoSemana] = useState<DesempenhoVendedorSemanal[]>([]);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [comissoesMensal, setComissoesMensal] = useState<ComissaoMensal[]>([]);
  const [faixasComissao, setFaixasComissao] = useState<FaixaComissao[]>([]);
  const [statusSync, setStatusSync] = useState<StatusSincronizacao[]>([]);
  const [resumoClientes, setResumoClientes] = useState<ResumoClientesInatividade>({ total: 0, inativos: 0 });
  const [periodoMeta, setPeriodoMeta] = useState<PeriodoMeta>('mes');
  const [periodoDesempenho, setPeriodoDesempenho] = useState<PeriodoMeta>('dia');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const data = todayISO();
  const hoje = new Date();
  const semanaAtual = semanaDoDia(hoje.getDate());

  const load = useCallback(async () => {
    if (!profile) return;
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const [m, d, mm, dm, ms, ds, mt, cm, fx, ss, ci] = await Promise.all([
      repository.getMetricasVendedorDiario(profile, data),
      repository.getDesempenhoVendedorDiario(profile, data),
      repository.getMetricasVendedorMensal(profile, ano, mes),
      repository.getDesempenhoVendedorMensal(profile, ano, mes),
      repository.getMetricasVendedorSemanal(profile, ano, mes, semanaAtual),
      repository.getDesempenhoVendedorSemanal(profile, ano, mes, semanaAtual),
      repository.getMetas(profile, ano, mes),
      repository.getComissoesMensal(profile, ano, mes),
      repository.getFaixasComissao(),
      repository.getStatusSincronizacao(),
      // "Indicadores de gestão" agora aparece pra todo mundo (01/08/2026).
      repository.getResumoClientesInatividade(profile),
    ]);
    setMetricas(m);
    setDesempenho(d);
    setMetricasMes(mm);
    setDesempenhoMes(dm);
    setMetricasSemana(ms);
    setDesempenhoSemana(ds);
    setMetas(mt);
    setComissoesMensal(cm);
    setFaixasComissao(fx);
    setStatusSync(ss);
    setResumoClientes(ci);
  }, [profile, data, semanaAtual]);

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
  const totalCusto = sum(metricas, (m) => m.totalCusto);
  const totalNotas = sum(metricas, (m) => m.qtdNotas);
  const totalItens = sum(desempenho, (d) => d.quantidadeItens);
  const totalAtendimentos = sum(desempenho, (d) => d.quantidadeAtendimentos);

  const ticketMedio = totalNotas ? totalFaturamento / totalNotas : 0;
  const taxaDesconto = totalBruto ? (totalDesconto / totalBruto) * 100 : 0;
  const margemBruta = totalFaturamento ? ((totalFaturamento - totalCusto) / totalFaturamento) * 100 : 0;
  const itensPorAtendimento = totalAtendimentos ? totalItens / totalAtendimentos : 0;
  // Meta agora é de margem bruta em R$, não faturamento (01/08/2026) —
  // "realizado" do dia precisa ser margem também (faturamento - custo
  // do dia), senão compara meta de margem contra venda bruta.
  const realizadoHojePorVendedor = new Map(metricas.map((m) => [m.codigoVendedor, m.faturamentoLiquido - m.totalCusto]));

  // Comissão estimada — segue a regra real (>=100% da meta MENSAL =
  // 10% flat sobre o mês; senão, soma por semana, cada uma na sua
  // própria faixa). Não é mais o `comissao_estimada` de
  // vw_metricas_vendedor_diario/semanal/mensal (quebrado: prc_comissao
  // vem nulo pra vendas recentes da Trier).
  // Mês: já vem pronto de vw_metas_comissao/getComissoesMensal — vira
  // definitivo (frozen) depois do fechamento no último dia do mês.
  const comissaoMesTotal = sum(comissoesMensal, (c) => c.comissaoValor);
  // Semana: aproximação — cada vendedor na sua faixa pelo % batido NA
  // SEMANA atual, sem olhar a regra flat_10_mensal (essa só se aplica
  // no fechamento do mês inteiro).
  const comissaoSemanaTotal = sum(metas, (m) => {
    const semana = m.semanas.find((s) => s.semana === semanaAtual);
    if (!semana || semana.valorMeta <= 0) return 0;
    const percentual = (semana.valorRealizado / semana.valorMeta) * 100;
    const taxa = faixaComissaoPara(faixasComissao, percentual)?.percentualComissao ?? 0;
    return semana.valorRealizado * (taxa / 100);
  });
  // Dia: aproximação — não existe faixa "oficial" de dia na regra real,
  // usa a meta diária (mensal / dias do mês) contra o realizado de hoje.
  const comissaoDiaTotal = sum(metas, (m) => {
    const metaHoje = metaDiaria(m.valorMetaMensal, m.ano, m.mes);
    const realizadoHoje = realizadoHojePorVendedor.get(m.codigoVendedor) ?? 0;
    if (metaHoje <= 0) return 0;
    const percentual = (realizadoHoje / metaHoje) * 100;
    const taxa = faixaComissaoPara(faixasComissao, percentual)?.percentualComissao ?? 0;
    return realizadoHoje * (taxa / 100);
  });

  // Projeção simples: pega o realizado do mês até hoje (já calculado de
  // verdade em vw_metas_progresso via getMetas — margem bruta, não é
  // só o dia de hoje), tira a média diária e multiplica pelos dias do
  // mês inteiro. Ex.: dia 3, R$9 mil de margem no mês = R$3 mil/dia de
  // média x 30 dias = R$90 mil de margem projetada.
  const totalRealizadoMensal = sum(metas, (m) => m.valorRealizadoMensal);
  const diaDoMes = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecaoFechamento = diaDoMes > 0 ? (totalRealizadoMensal / diaDoMes) * diasNoMes : 0;

  // Desempenho do mês: faturamento e comissão são o ACUMULADO (soma
  // direta); os demais já são taxa/proporção por natureza (ticket
  // médio, itens/atendimento, desconto, margem — todos "total sobre
  // total", não soma), então calculá-los no escopo do mês já dá a
  // média certa, sem precisar dividir de novo. "Vendas realizadas"
  // vira média por dia decorrido, pra comparar com o número de hoje
  // (senão seria só um total grande, sem contexto).
  const totalFaturamentoMes = sum(metricasMes, (m) => m.faturamentoLiquido);
  const totalBrutoMes = sum(metricasMes, (m) => m.faturamentoBruto);
  const totalDescontoMes = sum(metricasMes, (m) => m.totalDesconto);
  const totalCustoMes = sum(metricasMes, (m) => m.totalCusto);
  const totalNotasMes = sum(metricasMes, (m) => m.qtdNotas);
  const totalItensMes = sum(desempenhoMes, (d) => d.quantidadeItens);
  const totalAtendimentosMes = sum(desempenhoMes, (d) => d.quantidadeAtendimentos);

  const ticketMedioMes = totalNotasMes ? totalFaturamentoMes / totalNotasMes : 0;
  const taxaDescontoMes = totalBrutoMes ? (totalDescontoMes / totalBrutoMes) * 100 : 0;
  const margemBrutaMes = totalFaturamentoMes ? ((totalFaturamentoMes - totalCustoMes) / totalFaturamentoMes) * 100 : 0;
  const itensPorAtendimentoMes = totalAtendimentosMes ? totalItensMes / totalAtendimentosMes : 0;
  const vendasPorDiaMes = diaDoMes > 0 ? totalNotasMes / diaDoMes : 0;

  // Mesma ideia de "Desempenho do mês", só que no bucket de semana fixo
  // (1-7, 8-14, 15-21, 22-fim do mês — mesmo critério de semanaDoDia()
  // usado em Metas).
  const totalFaturamentoSemana = sum(metricasSemana, (m) => m.faturamentoLiquido);
  const totalBrutoSemana = sum(metricasSemana, (m) => m.faturamentoBruto);
  const totalCustoSemana = sum(metricasSemana, (m) => m.totalCusto);
  const totalNotasSemana = sum(metricasSemana, (m) => m.qtdNotas);
  const totalItensSemana = sum(desempenhoSemana, (d) => d.quantidadeItens);
  const totalAtendimentosSemana = sum(desempenhoSemana, (d) => d.quantidadeAtendimentos);
  const totalDescontoSemana = sum(metricasSemana, (m) => m.totalDesconto);

  const ticketMedioSemana = totalNotasSemana ? totalFaturamentoSemana / totalNotasSemana : 0;
  const taxaDescontoSemana = totalBrutoSemana ? (totalDescontoSemana / totalBrutoSemana) * 100 : 0;
  const margemBrutaSemana = totalFaturamentoSemana ? ((totalFaturamentoSemana - totalCustoSemana) / totalFaturamentoSemana) * 100 : 0;
  const itensPorAtendimentoSemana = totalAtendimentosSemana ? totalItensSemana / totalAtendimentosSemana : 0;
  const diasNaSemana = diasDecorridosNaSemana(hoje.getFullYear(), hoje.getMonth() + 1, semanaAtual, hoje);
  const vendasPorDiaSemana = diasNaSemana > 0 ? totalNotasSemana / diasNaSemana : 0;

  // Card "Desempenho" unificado — o toggle Dia/Semana/Mês troca só os
  // dados exibidos, a estrutura dos tiles é a mesma nos 3 casos.
  const desempenho7 =
    periodoDesempenho === 'dia'
      ? {
          vazio: metricas.length === 0,
          faturamentoLabel: 'Faturamento líquido',
          faturamento: totalFaturamento,
          ticketMedio,
          itensPorAtendimento,
          taxaDesconto,
          comissaoLabel: 'Comissão estimada',
          comissao: comissaoDiaTotal,
          vendasLabel: 'Vendas realizadas',
          vendasValor: String(totalNotas),
          margemBruta,
        }
      : periodoDesempenho === 'semana'
      ? {
          vazio: metricasSemana.length === 0,
          faturamentoLabel: 'Faturamento líquido (acum.)',
          faturamento: totalFaturamentoSemana,
          ticketMedio: ticketMedioSemana,
          itensPorAtendimento: itensPorAtendimentoSemana,
          taxaDesconto: taxaDescontoSemana,
          comissaoLabel: 'Comissão estimada (acum.)',
          comissao: comissaoSemanaTotal,
          vendasLabel: 'Vendas / dia (média)',
          vendasValor: vendasPorDiaSemana.toFixed(1),
          margemBruta: margemBrutaSemana,
        }
      : {
          vazio: metricasMes.length === 0,
          faturamentoLabel: 'Faturamento líquido (acum.)',
          faturamento: totalFaturamentoMes,
          ticketMedio: ticketMedioMes,
          itensPorAtendimento: itensPorAtendimentoMes,
          taxaDesconto: taxaDescontoMes,
          comissaoLabel: 'Comissão estimada (acum.)',
          comissao: comissaoMesTotal,
          vendasLabel: 'Vendas / dia (média)',
          vendasValor: vendasPorDiaMes.toFixed(1),
          margemBruta: margemBrutaMes,
        };

  // Ranking (corrida de vendas) — mesma fonte de dado do card
  // "Desempenho", só que por vendedor em vez de somada, ordenada por
  // faturamento. Segue o mesmo período selecionado (periodoDesempenho).
  const metricasDoPeriodo =
    periodoDesempenho === 'dia' ? metricas : periodoDesempenho === 'semana' ? metricasSemana : metricasMes;
  const rankingAtual = metricasDoPeriodo
    .slice()
    .sort((a, b) => b.faturamentoLiquido - a.faturamentoLiquido)
    .map((m) => ({ codigoVendedor: m.codigoVendedor, nomeVendedor: m.nomeVendedor, faturamentoLiquido: m.faturamentoLiquido }));

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

      <Card>
        <Text style={styles.sectionTitle}>Desempenho</Text>
        <PeriodoMetaSelector value={periodoDesempenho} onChange={setPeriodoDesempenho} />
        {desempenho7.vazio ? (
          <Text style={styles.empty}>Sem vendas registradas nesse período.</Text>
        ) : (
          <View style={styles.tileRow}>
            <MetricTile label={desempenho7.faturamentoLabel} value={formatBRL(desempenho7.faturamento)} accentColor={colors.success} />
            <MetricTile label="Ticket médio" value={formatBRL(desempenho7.ticketMedio)} accentColor={colors.navy} />
            <MetricTile label="Itens / atendimento" value={desempenho7.itensPorAtendimento.toFixed(2)} accentColor="#9333ea" />
            <MetricTile label="Taxa de desconto" value={`${desempenho7.taxaDesconto.toFixed(2)}%`} accentColor={colors.red} />
            <MetricTile label={desempenho7.comissaoLabel} value={formatBRL(desempenho7.comissao)} accentColor="#0891b2" />
            <MetricTile label={desempenho7.vendasLabel} value={desempenho7.vendasValor} accentColor={colors.textSecondary} />
            <MetricTile
              label="Margem bruta"
              value={`${desempenho7.margemBruta.toFixed(2)}%`}
              accentColor={desempenho7.margemBruta < 30 ? colors.red : colors.success}
            />
          </View>
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>📈 Indicadores de gestão</Text>
        <View style={styles.tileRow}>
          <MetricTile
            label="Clientes inativos"
            value={`${resumoClientes.inativos.toLocaleString('pt-BR')} de ${resumoClientes.total.toLocaleString('pt-BR')}`}
            accentColor={colors.red}
            numberOfLines={2}
          />
          <MetricTile label="Projeção de margem no mês" value={formatBRLSemCentavos(projecaoFechamento)} accentColor="#9333ea" />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>🎯 Metas</Text>
        <PeriodoMetaSelector value={periodoMeta} onChange={setPeriodoMeta} />
        {metas.length === 0 ? (
          <Text style={styles.empty}>Nenhuma meta cadastrada pra este mês ainda.</Text>
        ) : (
          // Ranking completo pra todo mundo (gestor e vendedor) — "ver
          // o resultado dos outros" (01/08/2026), não só o próprio.
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
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>🏆 Ranking</Text>
        <Text style={styles.rankingPeriodo}>
          {periodoDesempenho === 'dia' ? 'Hoje' : periodoDesempenho === 'semana' ? 'Esta semana' : 'Este mês'}
          {' · segue o período escolhido em "Desempenho" acima'}
        </Text>
        <CorridaDeVendas ranking={rankingAtual} meuCodigoVendedor={profile?.codigoVendedor} />
      </Card>
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
  empty: { color: colors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 10 },
  rankingPeriodo: { fontSize: 11, color: colors.textMuted, marginBottom: 10 },
});
