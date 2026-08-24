import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';
import { mesAnoLabel } from '../lib/metas';
import { alertar } from '../lib/alert';
import {
  codigosVendedorComAtividade,
  deltaPercentual,
  margemBrutaTotal,
  METRICAS_FARMACIA,
  METRICAS_VENDEDOR_SIMPLES,
  METRICAS_VENDEDOR_VENDA,
  MetricaVenda,
  metricaVenda,
  valorMetrica,
} from '../lib/relatorioMensal';
import { MetricaMensal, VendedorAtivo } from '../types/domain';

// Erro do Supabase/PostgREST (ex.: PostgrestError de uma chamada RPC)
// não é instanceof Error — é um objeto plano com .message. Mesmo
// helper usado em CarteiraClientesScreen.tsx.
function mensagemErro(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (typeof erro === 'object' && erro !== null && 'message' in erro && (erro as { message?: unknown }).message) {
    return String((erro as { message: unknown }).message);
  }
  return 'Tente novamente.';
}

function hojeAnoMes(): { ano: number; mes: number } {
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
}

function mesReferenciaISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte = último dia do mês atual.
  return new Date(ano, mes, 0).getDate();
}

// "Mesmo dia do mês anterior" pra comparação justa — clampado pro
// último dia real desse mês (ex.: dia 31 não existe em fevereiro).
function mesReferenciaComDia(ano: number, mes: number, dia: number): string {
  const diaClampado = Math.min(dia, ultimoDiaDoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaClampado).padStart(2, '0')}`;
}

// Selo "↑12%"/"↓8%" vs mês anterior — só aparece quando dá pra
// comparar (mês anterior tinha valor diferente de zero pra essa
// métrica). É o que dá contexto ao número sozinho, sem exigir gráfico.
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const positivo = delta >= 0;
  return (
    <Text style={[styles.delta, positivo ? styles.deltaPositivo : styles.deltaNegativo]}>
      {positivo ? '↑' : '↓'} {Math.abs(Math.round(delta))}%
    </Text>
  );
}

function LinhaMetricaSimples({
  titulo,
  atual,
  anterior,
  formato,
}: {
  titulo: string;
  atual: number;
  anterior: number;
  formato: 'numero' | 'moeda';
}) {
  return (
    <View style={styles.metricaLinha}>
      <Text style={styles.metricaTitulo}>{titulo}</Text>
      <View style={styles.metricaValorLinha}>
        <Text style={styles.metricaValor}>{formato === 'moeda' ? formatBRL(atual) : atual}</Text>
        <DeltaBadge delta={deltaPercentual(atual, anterior)} />
      </View>
    </View>
  );
}

// Só aparece se teve atividade nesse mês — "métrica sem atividade não
// mostra linha em branco" (pedido explícito, evita poluir a tela).
function BlocoMetricaVenda({
  titulo,
  unidadeQuantidade,
  atual,
  anterior,
}: {
  titulo: string;
  unidadeQuantidade: string;
  atual: MetricaVenda;
  anterior: MetricaVenda;
}) {
  if (atual.quantidade === 0 && atual.valor === 0) return null;
  return (
    <View style={styles.vendaBloco}>
      <Text style={styles.metricaTitulo}>{titulo}</Text>
      <View style={styles.vendaStatsRow}>
        <Text style={styles.vendaStat}>
          {atual.quantidade} {unidadeQuantidade}
          {atual.quantidade === 1 ? '' : 's'}
        </Text>
        <Text style={styles.vendaStat}>{formatBRL(atual.valor)}</Text>
        <View style={styles.vendaMargemLinha}>
          <Text style={styles.vendaMargem}>margem {formatBRL(atual.margem)}</Text>
          <DeltaBadge delta={deltaPercentual(atual.margem, anterior.margem)} />
        </View>
      </View>
    </View>
  );
}

// Card de UM vendedor — colapsado mostra só nome + margem bruta total
// em destaque; clicar expande carteira/whatsapp/ligação + cada
// categoria de venda com atividade no mês. Mesmo padrão de
// Carteira/Venda Adicional em Alertas (23/08/2026).
function CardVendedor({
  vendedor,
  metricas,
  metricasAnterior,
  destaque,
  aberto,
  onToggle,
}: {
  vendedor: VendedorAtivo;
  metricas: MetricaMensal[];
  metricasAnterior: MetricaMensal[];
  destaque: boolean;
  aberto: boolean;
  onToggle: () => void;
}) {
  const margemTotal = margemBrutaTotal(metricas, vendedor.codigo);
  const margemTotalAnterior = margemBrutaTotal(metricasAnterior, vendedor.codigo);

  return (
    <Card>
      <Pressable style={styles.vendedorHeader} onPress={onToggle}>
        <View style={styles.vendedorInfo}>
          <Text style={styles.vendedorNome} numberOfLines={1}>
            {destaque ? '🏆 ' : ''}
            {vendedor.nome}
          </Text>
          <View style={styles.metricaValorLinha}>
            <Text style={styles.vendedorMargemValor}>{formatBRL(margemTotal)} de margem</Text>
            <DeltaBadge delta={deltaPercentual(margemTotal, margemTotalAnterior)} />
          </View>
        </View>
        <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>

      {aberto && (
        <View style={styles.vendedorDetalhe}>
          {METRICAS_VENDEDOR_SIMPLES.map((def) => (
            <LinhaMetricaSimples
              key={def.chave}
              titulo={def.titulo}
              atual={valorMetrica(metricas, vendedor.codigo, def.chave)}
              anterior={valorMetrica(metricasAnterior, vendedor.codigo, def.chave)}
              formato={def.formato}
            />
          ))}
          {METRICAS_VENDEDOR_VENDA.map((def) => (
            <BlocoMetricaVenda
              key={def.chave}
              titulo={def.titulo}
              unidadeQuantidade={def.unidadeQuantidade}
              atual={metricaVenda(metricas, vendedor.codigo, def.chave)}
              anterior={metricaVenda(metricasAnterior, vendedor.codigo, def.chave)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

export function RelatorioMensalScreen() {
  const { profile } = useAuth();
  const [{ ano, mes }, setAnoMes] = useState(hojeAnoMes());
  const [vendedores, setVendedores] = useState<VendedorAtivo[]>([]);
  const [metricas, setMetricas] = useState<MetricaMensal[]>([]);
  const [metricasAnterior, setMetricasAnterior] = useState<MetricaMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendedorAberto, setVendedorAberto] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const anteriorAnoMes = mesAnterior(ano, mes);
      const hoje = hojeAnoMes();
      // Mês em andamento: comparar com o mês anterior INTEIRO não é
      // justo (mês fechado sempre "ganha" só por ter mais dias
      // somados) — recorta o mês anterior no mesmo dia corrido, pra
      // comparar dia-a-dia igual (pedido explícito 23/08/2026).
      const ehMesAtualAgora = ano === hoje.ano && mes === hoje.mes;
      const ateDataAnterior = ehMesAtualAgora
        ? mesReferenciaComDia(anteriorAnoMes.ano, anteriorAnoMes.mes, new Date().getDate())
        : undefined;

      const [atual, anterior] = await Promise.all([
        repository.getMetricasMensais(profile, mesReferenciaISO(ano, mes)),
        repository.getMetricasMensais(profile, mesReferenciaISO(anteriorAnoMes.ano, anteriorAnoMes.mes), ateDataAnterior),
      ]);
      setMetricas(atual);
      setMetricasAnterior(anterior);
    } catch (erro) {
      alertar('Erro ao carregar relatório', mensagemErro(erro));
    } finally {
      setLoading(false);
    }
  }, [profile, ano, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!profile) return;
    repository.getVendedoresAtivos(profile).then(setVendedores);
  }, [profile]);

  useEffect(() => {
    setVendedorAberto(null);
  }, [ano, mes]);

  const mudarMes = (delta: number) => {
    setAnoMes(({ ano, mes }) => {
      let novoMes = mes + delta;
      let novoAno = ano;
      if (novoMes > 12) {
        novoMes = 1;
        novoAno += 1;
      } else if (novoMes < 1) {
        novoMes = 12;
        novoAno -= 1;
      }
      return { ano: novoAno, mes: novoMes };
    });
  };

  // Só quem teve alguma linha de métrica esse mês — vendedor sem
  // atividade nenhuma não aparece (pedido explícito, evita poluir).
  const vendedoresComAtividade = useMemo(() => {
    const codigos = codigosVendedorComAtividade(metricas);
    return vendedores
      .filter((v) => codigos.has(v.codigo))
      .sort((a, b) => margemBrutaTotal(metricas, b.codigo) - margemBrutaTotal(metricas, a.codigo));
  }, [vendedores, metricas]);

  const destaqueDoMes = vendedoresComAtividade[0]?.codigo ?? null;

  // Mês corrente não tem linha congelada ainda (só fecha dia 1 do mês
  // seguinte) — o repositório devolve uma prévia calculada na hora
  // pra esse caso (ver getMetricasMensais), mas ainda pode mudar até
  // lá, então avisa que não é o número final.
  const ehMesAtual = useMemo(() => {
    const hoje = new Date();
    return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
  }, [ano, mes]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.conteudo}>
      <Text style={styles.title}>📈 Relatório mensal</Text>
      <Text style={styles.subtitle}>Métricas fechadas mês a mês — carteira, contato, vendas e margem por vendedor.</Text>

      <View style={styles.mesSeletor}>
        <Pressable onPress={() => mudarMes(-1)} style={styles.mesBotao} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </Pressable>
        <Text style={styles.mesLabel}>{mesAnoLabel(ano, mes)}</Text>
        <Pressable onPress={() => mudarMes(1)} style={styles.mesBotao} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.navy} />
        </Pressable>
      </View>

      {ehMesAtual && (
        <Text style={styles.avisoMesAtual}>🔴 Mês em andamento — prévia calculada agora, ainda não fechou</Text>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : metricas.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            {ehMesAtual ? 'Nenhuma atividade registrada esse mês ainda.' : 'Nenhuma métrica fechada pra esse mês ainda.'}
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.sectionTitulo}>Farmácia</Text>
            {METRICAS_FARMACIA.map((def) => (
              <LinhaMetricaSimples
                key={def.chave}
                titulo={def.titulo}
                atual={valorMetrica(metricas, null, def.chave)}
                anterior={valorMetrica(metricasAnterior, null, def.chave)}
                formato={def.formato}
              />
            ))}
          </Card>

          <Text style={[styles.sectionTitulo, styles.porVendedorTitulo]}>Por vendedor</Text>
          {vendedoresComAtividade.length === 0 ? (
            <Card>
              <Text style={styles.empty}>Nenhum vendedor com atividade registrada esse mês.</Text>
            </Card>
          ) : (
            vendedoresComAtividade.map((v) => (
              <CardVendedor
                key={v.codigo}
                vendedor={v}
                metricas={metricas}
                metricasAnterior={metricasAnterior}
                destaque={v.codigo === destaqueDoMes}
                aberto={vendedorAberto === v.codigo}
                onToggle={() => setVendedorAberto((atual) => (atual === v.codigo ? null : v.codigo))}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  conteudo: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  mesSeletor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 },
  mesBotao: { padding: 6 },
  mesLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, minWidth: 150, textAlign: 'center' },
  avisoMesAtual: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 },
  empty: { color: colors.textSecondary },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  porVendedorTitulo: { marginTop: 16, marginBottom: 8 },
  metricaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricaTitulo: { fontSize: 13, color: colors.textPrimary, flex: 1 },
  metricaValorLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricaValor: { fontSize: 14, fontWeight: '700', color: colors.navy },
  delta: { fontSize: 11, fontWeight: '700' },
  deltaPositivo: { color: colors.success },
  deltaNegativo: { color: colors.red },
  vendaBloco: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  vendaStatsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 2 },
  vendaStat: { fontSize: 12, color: colors.textSecondary },
  vendaMargemLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vendaMargem: { fontSize: 12, fontWeight: '700', color: colors.navy },
  vendedorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  vendedorInfo: { flex: 1 },
  vendedorNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  vendedorMargemValor: { fontSize: 13, color: colors.textSecondary },
  vendedorDetalhe: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
