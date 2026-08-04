import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { MetaProgressBar } from '../components/MetaProgressBar';
import { formatBRL, formatBRLSemCentavos, todayISO } from '../lib/format';
import { comissaoAproximada, diasDecorridosNaSemana, diasNoBucketSemana, semanaDoDia, valoresDaMeta } from '../lib/metas';
import { ComissaoMensal, FaixaComissao, MetaVendedor, MetricasVendedorDiario } from '../types/domain';
import { colors } from '../theme/colors';

export function MetaScreen() {
  const { profile } = useAuth();
  const ehGestor = profile?.role === 'gestor';
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [metricasHoje, setMetricasHoje] = useState<MetricasVendedorDiario[]>([]);
  const [comissoesMensal, setComissoesMensal] = useState<ComissaoMensal[]>([]);
  const [faixasComissao, setFaixasComissao] = useState<FaixaComissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | null>(null);

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const semanaAtual = semanaDoDia(hoje.getDate());

  const load = useCallback(async () => {
    if (!profile) return;
    const [mt, mh, cm, fx] = await Promise.all([
      repository.getMetas(profile, ano, mes),
      repository.getMetricasVendedorDiario(profile, todayISO()),
      repository.getComissoesMensal(profile, ano, mes),
      repository.getFaixasComissao(),
    ]);
    setMetas(mt);
    setMetricasHoje(mh);
    setComissoesMensal(cm);
    setFaixasComissao(fx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const vendedoresOrdenados = useMemo(
    () => metas.slice().sort((a, b) => a.nomeVendedor.localeCompare(b.nomeVendedor)),
    [metas]
  );

  const codigoVendedorAlvo = ehGestor ? codigoSelecionado ?? vendedoresOrdenados[0]?.codigoVendedor ?? null : profile?.codigoVendedor ?? null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const minhaMeta = metas.find((m) => m.codigoVendedor === codigoVendedorAlvo);
  const minhaComissaoMensal = comissoesMensal.find((c) => c.codigoVendedor === codigoVendedorAlvo);
  const realizadoHoje = metricasHoje.find((m) => m.codigoVendedor === codigoVendedorAlvo);
  const realizadoHojeValor = realizadoHoje ? realizadoHoje.faturamentoLiquido - realizadoHoje.totalCusto : 0;

  const valoresDia = minhaMeta ? valoresDaMeta(minhaMeta, 'dia', realizadoHojeValor, semanaAtual) : null;
  const valoresSemana = minhaMeta ? valoresDaMeta(minhaMeta, 'semana', realizadoHojeValor, semanaAtual) : null;
  const valoresMes = minhaMeta ? valoresDaMeta(minhaMeta, 'mes', realizadoHojeValor, semanaAtual) : null;

  const percentualSemanaAtual = valoresSemana && valoresSemana.valorMeta > 0 ? (valoresSemana.valorRealizado / valoresSemana.valorMeta) * 100 : 0;
  const diasDecorridos = diasDecorridosNaSemana(ano, mes, semanaAtual, hoje);
  const diasNoBucket = diasNoBucketSemana(semanaAtual, ano, mes);
  const diasRestantes = Math.max(diasNoBucket - diasDecorridos, 0);

  // "Precisa vender R$X por dia" — sempre mirando a faixa mais alta
  // (100%/10%), que é a referência que os vendedores já usam na
  // planilha (03/08/2026).
  const faltaParaTopo = valoresSemana ? Math.max(valoresSemana.valorMeta - valoresSemana.valorRealizado, 0) : 0;
  const porDiaParaTopo = diasRestantes > 0 ? faltaParaTopo / diasRestantes : 0;

  // Projeção: extrapola a média diária já feita na semana pro bucket
  // inteiro, e vê em que faixa isso cai — comissaoAproximada já faz
  // exatamente essa conta (valor x taxa da faixa batida).
  const mediaDiariaSemana = valoresSemana && diasDecorridos > 0 ? valoresSemana.valorRealizado / diasDecorridos : 0;
  const projecaoFimSemana = mediaDiariaSemana * diasNoBucket;
  const projecao = valoresSemana ? comissaoAproximada(projecaoFimSemana, valoresSemana.valorMeta, faixasComissao) : null;

  const faixaTaxaMaxima = faixasComissao[0]?.percentualComissao ?? 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>🎯 Meta</Text>
      <Text style={styles.subtitle}>Quanto você já fez, quanto falta, e o que isso vale em comissão.</Text>

      {ehGestor && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {vendedoresOrdenados.map((v) => (
            <Pressable
              key={v.codigoVendedor}
              style={[styles.chip, codigoVendedorAlvo === v.codigoVendedor && styles.chipAtivo]}
              onPress={() => setCodigoSelecionado(v.codigoVendedor)}
            >
              <Text style={[styles.chipTexto, codigoVendedorAlvo === v.codigoVendedor && styles.chipTextoAtivo]}>
                {v.nomeVendedor}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!minhaMeta ? (
        <Card>
          <Text style={styles.empty}>Nenhuma meta cadastrada pra este mês ainda.</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitulo}>📊 Resultado atual</Text>
            {valoresDia && <MetaProgressBar label="Hoje" valorRealizado={valoresDia.valorRealizado} valorMeta={valoresDia.valorMeta} />}
            {valoresSemana && (
              <MetaProgressBar label={valoresSemana.label} valorRealizado={valoresSemana.valorRealizado} valorMeta={valoresSemana.valorMeta} />
            )}
            {valoresMes && <MetaProgressBar label="Mês" valorRealizado={valoresMes.valorRealizado} valorMeta={valoresMes.valorMeta} />}
          </Card>

          <Card>
            <Text style={styles.cardTitulo}>🗓️ Metas do mês</Text>
            <View style={styles.tabela}>
              <View style={styles.tabelaLinha}>
                <Text style={[styles.tabelaCelula, styles.tabelaCelulaRotulo]} />
                <Text style={styles.tabelaCabecalho}>Mensal</Text>
                {minhaMeta.semanas.map((s) => (
                  <Text key={s.semana} style={styles.tabelaCabecalho}>
                    {s.rotulo}
                  </Text>
                ))}
              </View>
              <View style={styles.tabelaLinha}>
                <Text style={[styles.tabelaCelula, styles.tabelaCelulaRotulo]}>Meta</Text>
                <Text style={styles.tabelaCelula}>{formatBRLSemCentavos(minhaMeta.valorMetaMensal)}</Text>
                {minhaMeta.semanas.map((s) => (
                  <Text key={s.semana} style={styles.tabelaCelula}>
                    {formatBRLSemCentavos(s.valorMeta)}
                  </Text>
                ))}
              </View>
              <View style={styles.tabelaLinha}>
                <Text style={[styles.tabelaCelula, styles.tabelaCelulaRotulo]}>Feito</Text>
                <Text style={[styles.tabelaCelula, styles.tabelaCelulaFeito]}>{formatBRLSemCentavos(minhaMeta.valorRealizadoMensal)}</Text>
                {minhaMeta.semanas.map((s) => (
                  <Text key={s.semana} style={[styles.tabelaCelula, styles.tabelaCelulaFeito]}>
                    {formatBRLSemCentavos(s.valorRealizado)}
                  </Text>
                ))}
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitulo}>🏆 Faixas de comissão — semana atual</Text>
            {faixasComissao.map((f) => {
              const atingida = percentualSemanaAtual >= f.percentualMetaMin;
              const valorNecessario = valoresSemana ? valoresSemana.valorMeta * (f.percentualMetaMin / 100) : 0;
              return (
                <View key={f.percentualMetaMin} style={[styles.faixaRow, atingida && styles.faixaRowAtingida]}>
                  <Text style={[styles.faixaPercentual, atingida && styles.faixaTextoAtingido]}>
                    {f.percentualMetaMin > 0 ? `${f.percentualMetaMin}% da meta` : 'Abaixo de 70%'}
                  </Text>
                  <Text style={[styles.faixaValor, atingida && styles.faixaTextoAtingido]}>
                    {f.percentualMetaMin > 0 ? `a partir de ${formatBRLSemCentavos(valorNecessario)}` : '—'}
                  </Text>
                  <Text style={[styles.faixaTaxa, atingida && styles.faixaTextoAtingido]}>{f.percentualComissao}%</Text>
                </View>
              );
            })}
          </Card>

          <Card style={styles.cardIndicativo}>
            <Text style={styles.cardTitulo}>💡 Pra essa semana</Text>
            {percentualSemanaAtual >= 100 ? (
              <Text style={styles.indicativoTextoOk}>
                🎉 Você já bateu 100% da meta da semana — garantiu a faixa de {faixaTaxaMaxima}%!
              </Text>
            ) : diasRestantes > 0 ? (
              <Text style={styles.indicativoTexto}>
                Precisa vender <Text style={styles.indicativoDestaque}>{formatBRL(porDiaParaTopo)}</Text> por dia (nos próximos{' '}
                {diasRestantes} dia{diasRestantes > 1 ? 's' : ''}) para fazer {faixaTaxaMaxima}% na semana.
              </Text>
            ) : (
              <Text style={styles.indicativoTexto}>
                Faltam <Text style={styles.indicativoDestaque}>{formatBRL(faltaParaTopo)}</Text> pra fechar a semana em {faixaTaxaMaxima}%.
              </Text>
            )}

            {projecao && valoresSemana && valoresSemana.valorMeta > 0 && diasDecorridos > 0 && (
              <Text style={styles.indicativoTextoSecundario}>
                {projecao.taxa >= faixaTaxaMaxima
                  ? `No ritmo atual, você deve fechar a semana batendo a faixa de ${projecao.taxa}% — ≈ ${formatBRL(projecao.comissaoValor)} de comissão.`
                  : `Com essa performance, sua comissão será ${formatBRL(projecao.comissaoValor)}, alcançando apenas a faixa de ${projecao.taxa}%.`}
              </Text>
            )}
          </Card>

          {minhaComissaoMensal && (
            <Card>
              <Text style={styles.cardTitulo}>💰 Comissão do mês</Text>
              <Text style={styles.comissaoTexto}>
                {minhaComissaoMensal.regraAplicada === 'flat_10_mensal'
                  ? 'Meta mensal batida: 10% flat'
                  : `Taxa efetiva: ${minhaComissaoMensal.percentualComissao}% (soma por semana)`} sobre a margem bruta (
                {formatBRLSemCentavos(minhaComissaoMensal.margemBrutaValor)})
              </Text>
              <Text style={styles.comissaoValor}>≈ {formatBRL(minhaComissaoMensal.comissaoValor)} no fechamento do mês</Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  chipTextoAtivo: { color: colors.white },
  tabela: { gap: 6 },
  tabelaLinha: { flexDirection: 'row', alignItems: 'center' },
  tabelaCelulaRotulo: { width: 44, fontWeight: '700', color: colors.textSecondary },
  tabelaCabecalho: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.textMuted, textAlign: 'right' },
  tabelaCelula: { flex: 1, fontSize: 12, color: colors.textPrimary, textAlign: 'right' },
  tabelaCelulaFeito: { fontWeight: '700', color: colors.navy },
  faixaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 8,
  },
  faixaRowAtingida: { backgroundColor: '#E8F5EC' },
  faixaPercentual: { fontSize: 12, color: colors.textSecondary, flex: 1.2 },
  faixaValor: { fontSize: 12, color: colors.textMuted, flex: 1.4, textAlign: 'right' },
  faixaTaxa: { fontSize: 13, fontWeight: '700', color: colors.navy, width: 44, textAlign: 'right' },
  faixaTextoAtingido: { color: colors.success, fontWeight: '700' },
  cardIndicativo: { borderLeftWidth: 4, borderLeftColor: colors.navy },
  indicativoTexto: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  indicativoTextoOk: { fontSize: 13, color: colors.success, fontWeight: '700', lineHeight: 19 },
  indicativoDestaque: { fontWeight: '700', color: colors.navy },
  indicativoTextoSecundario: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  comissaoTexto: { fontSize: 12, color: colors.textSecondary },
  comissaoValor: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 4 },
});
