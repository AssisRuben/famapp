import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { alertar } from '../lib/alert';
import { AtividadeChecklist } from '../types/domain';

export function ChecklistGerenciarScreen() {
  const { profile } = useAuth();
  const [atividades, setAtividades] = useState<AtividadeChecklist[]>([]);
  const [loadingAtividades, setLoadingAtividades] = useState(true);
  const [novaAtividade, setNovaAtividade] = useState('');
  const [novoHorario, setNovoHorario] = useState('');

  const carregarAtividades = useCallback(async () => {
    if (!profile) return;
    setLoadingAtividades(true);
    setAtividades(await repository.getAtividadesChecklist(profile));
    setLoadingAtividades(false);
  }, [profile]);

  useEffect(() => {
    carregarAtividades();
  }, [carregarAtividades]);

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

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>✅ Check list</Text>

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
        <Text style={styles.hint}>O horário (opcional) dispara um lembrete push de segunda a sábado.</Text>
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
                  <Text style={styles.atividadeHorario}>🔔 {atividade.horario} · seg a sáb</Text>
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
        Ativa/inativa quais atividades aparecem no checklist diário dos vendedores — sem apagar o histórico já
        registrado.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  cardTitulo: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
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
