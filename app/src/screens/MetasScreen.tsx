import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { MetaProgressBar } from '../components/MetaProgressBar';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';
import { badgeFaixaComissao, mesAnoLabel, rotuloSemana } from '../lib/metas';
import { alertar } from '../lib/alert';
import { ComissaoMensal, MetaVendedor, VendedorAtivo } from '../types/domain';

function hojeAnoMes(): { ano: number; mes: number } {
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
}

export function MetasScreen() {
  const { profile } = useAuth();

  const [{ ano, mes }, setAnoMes] = useState(hojeAnoMes());
  const [vendedores, setVendedores] = useState<VendedorAtivo[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<number | null>(null);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [comissoes, setComissoes] = useState<ComissaoMensal[]>([]);

  const [valorMensal, setValorMensal] = useState('');
  const [valoresSemana, setValoresSemana] = useState(['', '', '', '']);

  // Lançamento em massa da meta mensal — seção própria no fim da tela,
  // com seletor de mês independente do formulário de cima (não afeta
  // nem é afetado pelo mês do detalhamento semanal).
  const [{ ano: anoLote, mes: mesLote }, setAnoMesLote] = useState(hojeAnoMes());
  const [metasLote, setMetasLote] = useState<MetaVendedor[]>([]);
  const [loadingLote, setLoadingLote] = useState(true);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [valoresLote, setValoresLote] = useState<Record<number, string>>({});

  const carregarMetas = useCallback(async () => {
    if (!profile) return;
    setLoadingMetas(true);
    const dados = await repository.getMetas(profile, ano, mes);
    setMetas(dados);
    setLoadingMetas(false);
    // Comissão só faz sentido pra fechamento MENSAL (não é semanal/diária)
    // — ver comentário em vw_metas_comissao no supabase/schema.sql.
    setComissoes(await repository.getComissoesMensal(profile, ano, mes));
  }, [profile, ano, mes]);

  const carregarLote = useCallback(async () => {
    if (!profile) return;
    setLoadingLote(true);
    setMetasLote(await repository.getMetas(profile, anoLote, mesLote));
    setLoadingLote(false);
  }, [profile, anoLote, mesLote]);

  useEffect(() => {
    carregarMetas();
  }, [carregarMetas]);

  useEffect(() => {
    carregarLote();
  }, [carregarLote]);

  useEffect(() => {
    if (!profile) return;
    repository.getVendedoresAtivos(profile).then((lista) => {
      setVendedores(lista);
      setVendedorSelecionado((atual) => atual ?? lista[0]?.codigo ?? null);
    });
  }, [profile]);

  useEffect(() => {
    const meta = metas.find((m) => m.codigoVendedor === vendedorSelecionado);
    if (meta) {
      setValorMensal(String(meta.valorMetaMensal));
      setValoresSemana(meta.semanas.map((s) => String(s.valorMeta)));
    }
  }, [metas, vendedorSelecionado]);

  // Preenche o lote com o valor já lançado (se tiver) assim que os
  // vendedores ou as metas do mês selecionado carregam/mudam — quem
  // não tem meta ainda no período fica com o campo em branco.
  useEffect(() => {
    setValoresLote(
      Object.fromEntries(
        vendedores.map((v) => {
          const meta = metasLote.find((m) => m.codigoVendedor === v.codigo);
          return [v.codigo, meta ? String(meta.valorMetaMensal) : ''];
        })
      )
    );
  }, [vendedores, metasLote]);

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

  const salvar = async () => {
    if (vendedorSelecionado == null) return;
    const mensal = Number(valorMensal.replace(',', '.'));
    const semanas = valoresSemana.map((v) => Number(v.replace(',', '.'))) as [number, number, number, number];

    if (Number.isNaN(mensal) || semanas.some((s) => Number.isNaN(s))) {
      alertar('Valores inválidos', 'Preencha todos os campos com números válidos.');
      return;
    }

    setSalvando(true);
    try {
      await repository.salvarMeta({
        codigoVendedor: vendedorSelecionado,
        ano,
        mes,
        valorMetaMensal: mensal,
        valoresMetaSemanal: semanas,
      });
      await carregarMetas();
      alertar('Meta salva', 'A meta foi atualizada com sucesso.');
    } finally {
      setSalvando(false);
    }
  };

  const mudarMesLote = (delta: number) => {
    setAnoMesLote(({ ano, mes }) => {
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

  // Lançamento rápido: só a meta mensal por vendedor, sem detalhar
  // semana a semana — divide em 4 partes iguais (o formulário de cima
  // continua disponível pra quem precisar ajustar cada semana à mão).
  // Vendedor com campo em branco é pulado (não zera meta de quem não
  // for atualizado nesse lançamento).
  const salvarLote = async () => {
    const entradas = Object.entries(valoresLote).filter(([, texto]) => texto.trim() !== '');
    if (entradas.length === 0) {
      alertar('Nada pra salvar', 'Preencha a meta de pelo menos um vendedor.');
      return;
    }

    const invalido = entradas.find(([, texto]) => Number.isNaN(Number(texto.replace(',', '.'))));
    if (invalido) {
      alertar('Valor inválido', 'Algum campo preenchido não é um número válido.');
      return;
    }

    setSalvandoLote(true);
    try {
      for (const [codigo, texto] of entradas) {
        const mensal = Number(texto.replace(',', '.'));
        const semana = Math.round((mensal / 4) * 100) / 100;
        await repository.salvarMeta({
          codigoVendedor: Number(codigo),
          ano: anoLote,
          mes: mesLote,
          valorMetaMensal: mensal,
          valoresMetaSemanal: [semana, semana, semana, semana],
        });
      }
      await carregarLote();
      alertar('Metas salvas', `Meta mensal atualizada pra ${entradas.length} vendedor(es).`);
    } finally {
      setSalvandoLote(false);
    }
  };

  const rotulos = useMemo(() => ([1, 2, 3, 4] as const).map((s) => rotuloSemana(s, ano, mes)), [ano, mes]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎯 Gestão da equipe</Text>

      <View style={styles.mesSeletor}>
        <Pressable onPress={() => mudarMes(-1)} style={styles.mesBotao} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </Pressable>
        <Text style={styles.mesLabel}>{mesAnoLabel(ano, mes)}</Text>
        <Pressable onPress={() => mudarMes(1)} style={styles.mesBotao} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.navy} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {vendedores.map((v) => (
          <Pressable
            key={v.codigo}
            style={[styles.chip, vendedorSelecionado === v.codigo && styles.chipAtivo]}
            onPress={() => setVendedorSelecionado(v.codigo)}
          >
            <Text style={[styles.chipTexto, vendedorSelecionado === v.codigo && styles.chipTextoAtivo]}>
              {v.nome}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Card>
        <Text style={styles.cardTitulo}>Meta mensal (margem bruta)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={valorMensal}
          onChangeText={setValorMensal}
          placeholder="Valor em R$"
        />

        <Text style={[styles.cardTitulo, styles.cardTituloEspacado]}>Metas semanais (margem bruta)</Text>
        {rotulos.map((rotulo, index) => (
          <View key={rotulo} style={styles.semanaInputRow}>
            <Text style={styles.semanaRotulo}>{rotulo}</Text>
            <TextInput
              style={[styles.input, styles.inputSemana]}
              keyboardType="numeric"
              value={valoresSemana[index]}
              onChangeText={(texto) =>
                setValoresSemana((atual) => atual.map((v, i) => (i === index ? texto : v)))
              }
              placeholder="R$"
            />
          </View>
        ))}

        <Pressable style={styles.salvarButton} onPress={salvar} disabled={salvando}>
          {salvando ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.salvarTexto}>Salvar meta</Text>
          )}
        </Pressable>
      </Card>

      <Text style={styles.sectionTitulo}>Panorama da equipe — {mesAnoLabel(ano, mes)}</Text>
      {loadingMetas ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        metas.map((meta) => {
          const comissao = comissoes.find((c) => c.codigoVendedor === meta.codigoVendedor);
          const badge = comissao ? badgeFaixaComissao(comissao.faixaAlcancada) : null;
          return (
            <Card key={meta.codigoVendedor}>
              <MetaProgressBar
                label={`${badge ? `${badge} ` : ''}${meta.nomeVendedor} — mensal`}
                valorRealizado={meta.valorRealizadoMensal}
                valorMeta={meta.valorMetaMensal}
              />
              {comissao ? (
                <View style={styles.comissaoRow}>
                  <Text style={styles.comissaoTexto}>
                    💰 {comissao.regraAplicada === 'flat_10_mensal'
                      ? 'Meta mensal batida: 10% flat'
                      : `Taxa efetiva: ${comissao.percentualComissao}% (soma por semana)`} sobre a margem bruta
                    ({formatBRL(comissao.margemBrutaValor)})
                  </Text>
                  <Text style={styles.comissaoValor}>
                    ≈ {formatBRL(comissao.comissaoValor)} de comissão no fechamento do mês
                  </Text>
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <Text style={[styles.sectionTitulo, styles.loteTitulo]}>Lançar meta mensal</Text>
      <Card>
        <View style={styles.mesSeletor}>
          <Pressable onPress={() => mudarMesLote(-1)} style={styles.mesBotao} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.navy} />
          </Pressable>
          <Text style={styles.mesLabel}>{mesAnoLabel(anoLote, mesLote)}</Text>
          <Pressable onPress={() => mudarMesLote(1)} style={styles.mesBotao} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={colors.navy} />
          </Pressable>
        </View>

        {loadingLote ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          vendedores.map((v) => (
            <View key={v.codigo} style={styles.loteRow}>
              <Text style={styles.loteNome} numberOfLines={1}>
                {v.nome}
              </Text>
              <TextInput
                style={[styles.input, styles.inputLote]}
                keyboardType="numeric"
                value={valoresLote[v.codigo] ?? ''}
                onChangeText={(texto) => setValoresLote((atual) => ({ ...atual, [v.codigo]: texto }))}
                placeholder="R$"
              />
            </View>
          ))
        )}

        <Pressable style={styles.salvarButton} onPress={salvarLote} disabled={salvandoLote || loadingLote}>
          {salvandoLote ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.salvarTexto}>Salvar</Text>
          )}
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  mesSeletor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  mesBotao: { padding: 6 },
  mesLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, minWidth: 150, textAlign: 'center' },
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
  cardTitulo: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  cardTituloEspacado: { marginTop: 14 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
  },
  semanaInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  semanaRotulo: { fontSize: 12, color: colors.textSecondary, width: 56 },
  inputSemana: { flex: 1 },
  salvarButton: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  salvarTexto: { color: colors.white, fontWeight: '700', fontSize: 14 },
  comissaoRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  comissaoTexto: { fontSize: 11, color: colors.textSecondary },
  comissaoValor: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 2 },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 4, marginBottom: 8 },
  loteTitulo: { marginTop: 20 },
  loteRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  loteNome: { flex: 1, fontSize: 13, color: colors.textPrimary },
  inputLote: { width: 130 },
});
