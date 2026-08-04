import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { alertar } from '../lib/alert';
import { AtividadeChecklist, VendedorAtivo } from '../types/domain';

// domingo=1 ... sábado=7 — mesma numeração usada em diasSemana (ver
// schema.sql) e no expo-notifications.
const DIAS_SEMANA: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: 'Dom' },
  { valor: 2, rotulo: 'Seg' },
  { valor: 3, rotulo: 'Ter' },
  { valor: 4, rotulo: 'Qua' },
  { valor: 5, rotulo: 'Qui' },
  { valor: 6, rotulo: 'Sex' },
  { valor: 7, rotulo: 'Sáb' },
];
const DIAS_SEGUNDA_A_SABADO = [2, 3, 4, 5, 6, 7];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function rotulosDias(dias: number[]): string {
  if (dias.length === 7) return 'Todo dia';
  return DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.rotulo)
    .join(', ');
}

export function ChecklistGerenciarScreen() {
  const { profile } = useAuth();
  const [atividades, setAtividades] = useState<AtividadeChecklist[]>([]);
  const [loadingAtividades, setLoadingAtividades] = useState(true);
  const [vendedores, setVendedores] = useState<VendedorAtivo[]>([]);

  const [novaAtividade, setNovaAtividade] = useState('');
  const [codigoVendedorNovo, setCodigoVendedorNovo] = useState<number | null>(null);
  const [diasSemanaNovo, setDiasSemanaNovo] = useState<number[]>(DIAS_SEGUNDA_A_SABADO);
  const [horaNovo, setHoraNovo] = useState<number | null>(null);
  const [modalHoraAberto, setModalHoraAberto] = useState(false);

  const carregarAtividades = useCallback(async () => {
    if (!profile) return;
    setLoadingAtividades(true);
    setAtividades(await repository.getAtividadesChecklist(profile));
    setLoadingAtividades(false);
  }, [profile]);

  useEffect(() => {
    carregarAtividades();
  }, [carregarAtividades]);

  useEffect(() => {
    if (!profile) return;
    repository.getVendedoresAtivos(profile).then(setVendedores);
  }, [profile]);

  const alternarDiaSemana = (valor: number) => {
    setDiasSemanaNovo((atual) =>
      atual.includes(valor) ? atual.filter((d) => d !== valor) : [...atual, valor].sort((a, b) => a - b)
    );
  };

  const adicionarAtividade = async () => {
    const titulo = novaAtividade.trim();
    if (!titulo) return;

    if (diasSemanaNovo.length === 0) {
      alertar('Selecione os dias', 'Escolha pelo menos um dia da semana.');
      return;
    }

    const horario = horaNovo != null ? `${String(horaNovo).padStart(2, '0')}:00` : null;

    await repository.salvarAtividadeChecklist({
      titulo,
      horario,
      codigoVendedor: codigoVendedorNovo,
      diasSemana: diasSemanaNovo,
    });
    setNovaAtividade('');
    setCodigoVendedorNovo(null);
    setDiasSemanaNovo(DIAS_SEGUNDA_A_SABADO);
    setHoraNovo(null);
    await carregarAtividades();
  };

  const alternarAtividade = async (atividade: AtividadeChecklist) => {
    await repository.alternarAtividadeChecklist(atividade.id, !atividade.ativo);
    await carregarAtividades();
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>✅ Check list</Text>

      <Card>
        <Text style={styles.cardTitulo}>Nova atividade</Text>
        <TextInput
          style={styles.input}
          value={novaAtividade}
          onChangeText={setNovaAtividade}
          placeholder="Ex.: Conferir vitrine da entrada"
        />

        <Text style={[styles.cardTitulo, styles.cardTituloEspacado]}>Vendedor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            style={[styles.chip, codigoVendedorNovo === null && styles.chipAtivo]}
            onPress={() => setCodigoVendedorNovo(null)}
          >
            <Text style={[styles.chipTexto, codigoVendedorNovo === null && styles.chipTextoAtivo]}>Todos</Text>
          </Pressable>
          {vendedores.map((v) => (
            <Pressable
              key={v.codigo}
              style={[styles.chip, codigoVendedorNovo === v.codigo && styles.chipAtivo]}
              onPress={() => setCodigoVendedorNovo(v.codigo)}
            >
              <Text style={[styles.chipTexto, codigoVendedorNovo === v.codigo && styles.chipTextoAtivo]}>
                {v.nome}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.cardTitulo, styles.cardTituloEspacado]}>Dias da semana</Text>
        <View style={styles.diasRow}>
          {DIAS_SEMANA.map((d) => (
            <Pressable
              key={d.valor}
              style={[styles.diaChip, diasSemanaNovo.includes(d.valor) && styles.chipAtivo]}
              onPress={() => alternarDiaSemana(d.valor)}
            >
              <Text style={[styles.chipTexto, diasSemanaNovo.includes(d.valor) && styles.chipTextoAtivo]}>
                {d.rotulo}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.cardTitulo, styles.cardTituloEspacado]}>Horário do lembrete</Text>
        <Pressable style={styles.horaBotao} onPress={() => setModalHoraAberto(true)}>
          <Ionicons name="time-outline" size={16} color={colors.navy} />
          <Text style={styles.horaBotaoTexto}>
            {horaNovo != null ? `${String(horaNovo).padStart(2, '0')}:00` : 'Sem lembrete'}
          </Text>
        </Pressable>

        <Pressable style={styles.addButton} onPress={adicionarAtividade}>
          <Text style={styles.addButtonTexto}>Adicionar atividade</Text>
        </Pressable>
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
                <Text style={styles.atividadeDetalhe}>
                  👤 {atividade.nomeVendedor ?? 'Todos'} · 📅 {rotulosDias(atividade.diasSemana)}
                  {atividade.horario ? ` · 🔔 ${atividade.horario.slice(0, 5)}` : ''}
                </Text>
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
        Ativa/inativa quais atividades aparecem no checklist diário dos vendedores — sem apagar o histórico já
        registrado.
      </Text>

      <Modal visible={modalHoraAberto} transparent animationType="fade" onRequestClose={() => setModalHoraAberto(false)}>
        <Pressable style={styles.modalFundo} onPress={() => setModalHoraAberto(false)}>
          <Pressable style={styles.modalConteudo} onPress={() => {}}>
            <Text style={styles.modalTitulo}>Horário do lembrete</Text>
            <ScrollView style={styles.modalLista}>
              <Pressable
                style={[styles.modalItem, horaNovo === null && styles.modalItemAtivo]}
                onPress={() => {
                  setHoraNovo(null);
                  setModalHoraAberto(false);
                }}
              >
                <Text style={[styles.modalItemTexto, horaNovo === null && styles.modalItemTextoAtivo]}>
                  Sem lembrete
                </Text>
              </Pressable>
              {HORAS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.modalItem, horaNovo === h && styles.modalItemAtivo]}
                  onPress={() => {
                    setHoraNovo(h);
                    setModalHoraAberto(false);
                  }}
                >
                  <Text style={[styles.modalItemTexto, horaNovo === h && styles.modalItemTextoAtivo]}>
                    {String(h).padStart(2, '0')}:00
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
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
  chipRow: { gap: 8, paddingBottom: 2 },
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
  diasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  diaChip: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  horaBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  horaBotaoTexto: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  addButton: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  addButtonTexto: { color: colors.white, fontWeight: '700', fontSize: 14 },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 4, marginBottom: 8 },
  atividadeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  atividadeInfo: { flex: 1 },
  atividadeTexto: { fontSize: 14, color: colors.textPrimary },
  atividadeTextoInativo: { color: colors.textMuted, textDecorationLine: 'line-through' },
  atividadeDetalhe: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: 20, lineHeight: 16 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalConteudo: {
    backgroundColor: colors.white,
    borderRadius: 12,
    width: '80%',
    maxHeight: '70%',
    padding: 16,
  },
  modalTitulo: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  modalLista: { maxHeight: 360 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  modalItemAtivo: { backgroundColor: colors.navy },
  modalItemTexto: { fontSize: 14, color: colors.textPrimary },
  modalItemTextoAtivo: { color: colors.white, fontWeight: '700' },
});
