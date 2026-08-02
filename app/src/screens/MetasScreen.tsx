import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { MetaProgressBar } from '../components/MetaProgressBar';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';
import { mesAnoLabel, rotuloSemana } from '../lib/metas';
import { alertar } from '../lib/alert';
import { vendedoresSeed } from '../data/mock/seed';
import { AtividadeChecklist, ComissaoMensal, MetaVendedor } from '../types/domain';

type Segmento = 'metas' | 'atividades';

function hojeAnoMes(): { ano: number; mes: number } {
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
}

export function MetasScreen() {
  const { profile } = useAuth();
  const [segmento, setSegmento] = useState<Segmento>('metas');

  const [{ ano, mes }, setAnoMes] = useState(hojeAnoMes());
  const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedoresSeed[0].codigo);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [comissoes, setComissoes] = useState<ComissaoMensal[]>([]);

  const [valorMensal, setValorMensal] = useState('');
  const [valoresSemana, setValoresSemana] = useState(['', '', '', '']);

  const [atividades, setAtividades] = useState<AtividadeChecklist[]>([]);
  const [loadingAtividades, setLoadingAtividades] = useState(true);
  const [novaAtividade, setNovaAtividade] = useState('');
  const [novoHorario, setNovoHorario] = useState('');

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

  const carregarAtividades = useCallback(async () => {
    if (!profile) return;
    setLoadingAtividades(true);
    setAtividades(await repository.getAtividadesChecklist(profile));
    setLoadingAtividades(false);
  }, [profile]);

  useEffect(() => {
    carregarMetas();
  }, [carregarMetas]);

  useEffect(() => {
    carregarAtividades();
  }, [carregarAtividades]);

  useEffect(() => {
    const meta = metas.find((m) => m.codigoVendedor === vendedorSelecionado);
    if (meta) {
      setValorMensal(String(meta.valorMetaMensal));
      setValoresSemana(meta.semanas.map((s) => String(s.valorMeta)));
    }
  }, [metas, vendedorSelecionado]);

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

  const adicionarAtividade = async () => {
    const titulo = novaAtividade.trim();
    if (!titulo) return;

    const horario = novoHorario.trim();
    if (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
      alertar('Horário inválido', 'Use o formato HH:mm, por exemplo 08:30.');
      return;
    }

    await repository.salvarAtividadeChecklist({ titulo, horario: horario || null });
    setNovaAtividade('');
    setNovoHorario('');
    await carregarAtividades();
  };

  const alternarAtividade = async (atividade: AtividadeChecklist) => {
    await repository.alternarAtividadeChecklist(atividade.id, !atividade.ativo);
    await carregarAtividades();
  };

  const rotulos = useMemo(() => ([1, 2, 3, 4] as const).map((s) => rotuloSemana(s, ano, mes)), [ano, mes]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎯 Gestão da equipe</Text>

      <View style={styles.segmentedWrap}>
        <Pressable
          style={[styles.segmentButton, segmento === 'metas' && styles.segmentButtonAtivo]}
          onPress={() => setSegmento('metas')}
        >
          <Text style={[styles.segmentText, segmento === 'metas' && styles.segmentTextAtivo]}>Metas</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentButton, segmento === 'atividades' && styles.segmentButtonAtivo]}
          onPress={() => setSegmento('atividades')}
        >
          <Text style={[styles.segmentText, segmento === 'atividades' && styles.segmentTextAtivo]}>
            Checklist diário
          </Text>
        </Pressable>
      </View>

      {segmento === 'metas' ? (
        <>
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
            {vendedoresSeed.map((v) => (
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
              return (
                <Card key={meta.codigoVendedor}>
                  <MetaProgressBar
                    label={`${meta.nomeVendedor} — mensal`}
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
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitulo}>Nova atividade</Text>
            <View style={styles.novaAtividadeRow}>
              <TextInput
                style={[styles.input, styles.inputAtividade]}
                value={novaAtividade}
                onChangeText={setNovaAtividade}
                placeholder="Ex.: Conferir vitrine da entrada"
              />
              <TextInput
                style={[styles.input, styles.inputHorario]}
                value={novoHorario}
                onChangeText={setNovoHorario}
                placeholder="HH:mm"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
              <Pressable style={styles.addButton} onPress={adicionarAtividade}>
                <Ionicons name="add" size={20} color={colors.white} />
              </Pressable>
            </View>
            <Text style={styles.hint}>
              O horário (opcional) dispara um lembrete push de segunda a sábado.
            </Text>
          </Card>

          <Text style={styles.sectionTitulo}>Atividades cadastradas</Text>
          {loadingAtividades ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : (
            atividades.map((atividade) => (
              <Card key={atividade.id}>
                <View style={styles.atividadeRow}>
                  <View style={styles.atividadeInfo}>
                    <Text
                      style={[styles.atividadeTexto, !atividade.ativo && styles.atividadeTextoInativo]}
                      numberOfLines={2}
                    >
                      {atividade.titulo}
                    </Text>
                    {atividade.horario ? (
                      <Text style={styles.atividadeHorario}>
                        🔔 {atividade.horario} · seg a sáb
                      </Text>
                    ) : null}
                  </View>
                  <Switch
                    value={atividade.ativo}
                    onValueChange={() => alternarAtividade(atividade)}
                    trackColor={{ true: colors.navy, false: colors.border }}
                  />
                </View>
              </Card>
            ))
          )}
          <Text style={styles.hint}>
            Ativa/inativa quais atividades aparecem no checklist diário dos vendedores — sem apagar o
            histórico já registrado.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  segmentButton: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentButtonAtivo: { backgroundColor: colors.navy },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segmentTextAtivo: { color: colors.white },
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
  novaAtividadeRow: { flexDirection: 'row', gap: 8 },
  inputAtividade: { flex: 1 },
  inputHorario: { width: 72, textAlign: 'center' },
  addButton: {
    backgroundColor: colors.navy,
    borderRadius: 8,
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atividadeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  atividadeInfo: { flex: 1 },
  atividadeTexto: { fontSize: 14, color: colors.textPrimary },
  atividadeTextoInativo: { color: colors.textMuted, textDecorationLine: 'line-through' },
  atividadeHorario: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: 20, lineHeight: 16 },
});
