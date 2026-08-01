import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { alertar } from '../lib/alert';
import { formatDateBR, todayISO } from '../lib/format';
import { sincronizarNotificacoesChecklist } from '../lib/notifications';
import { ChecklistItemStatus } from '../types/domain';

export function ChecklistScreen() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<ChecklistItemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const dados = await repository.getChecklistHoje(profile);
    setItens(dados);
    // agenda (ou reagenda) os lembretes push de seg a sáb com base nas
    // atividades ativas de hoje — não bloqueia a tela se demorar/falhar.
    sincronizarNotificacoesChecklist(dados.map((d) => d.atividade));
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

  const alternar = async (item: ChecklistItemStatus) => {
    if (!profile) return;
    // otimista: atualiza a UI antes da resposta do storage
    setItens((atual) =>
      atual.map((i) => (i.atividade.id === item.atividade.id ? { ...i, concluida: !i.concluida } : i))
    );
    try {
      await repository.marcarChecklistItem(profile, item.atividade.id, !item.concluida);
    } catch (erro) {
      // desfaz o otimismo — sem isso, o checkbox ficava "marcado" na
      // tela mesmo quando o storage não confirmava a gravação.
      setItens((atual) =>
        atual.map((i) => (i.atividade.id === item.atividade.id ? { ...i, concluida: item.concluida } : i))
      );
      alertar('Erro ao salvar', erro instanceof Error ? erro.message : 'Tente novamente.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const concluidas = itens.filter((i) => i.concluida).length;
  const pct = itens.length ? (concluidas / itens.length) * 100 : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>✅ Tarefas do dia</Text>
      <Text style={styles.subtitle}>{formatDateBR(todayISO())}</Text>

      <Card>
        <View style={styles.progressoHeader}>
          <Text style={styles.progressoTexto}>
            {concluidas}/{itens.length} concluídas
          </Text>
          <Text style={styles.progressoPct}>{pct.toFixed(0)}%</Text>
        </View>
        <View style={styles.progressoTrack}>
          <View style={[styles.progressoFill, { width: `${pct}%` }]} />
        </View>
      </Card>

      {itens.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nenhuma atividade cadastrada pelo gestor ainda.</Text>
        </Card>
      ) : (
        itens.map((item) => (
          <Pressable key={item.atividade.id} onPress={() => alternar(item)}>
            <Card style={styles.itemCard}>
              <View style={[styles.checkbox, item.concluida && styles.checkboxMarcado]}>
                {item.concluida && <Ionicons name="checkmark" size={16} color={colors.white} />}
              </View>
              <Text style={[styles.itemTexto, item.concluida && styles.itemTextoConcluido]}>
                {item.atividade.titulo}
              </Text>
              {item.atividade.horario ? (
                <View style={styles.horarioBadge}>
                  <Ionicons name="notifications-outline" size={12} color={colors.navy} />
                  <Text style={styles.horarioBadgeTexto}>{item.atividade.horario}</Text>
                </View>
              ) : null}
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  empty: { color: colors.textSecondary },
  progressoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressoTexto: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressoPct: { fontSize: 14, fontWeight: '700', color: colors.navy },
  progressoTrack: { height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
  progressoFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: colors.success, borderColor: colors.success },
  itemTexto: { flex: 1, fontSize: 14, color: colors.textPrimary },
  itemTextoConcluido: { color: colors.textMuted, textDecorationLine: 'line-through' },
  horarioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  horarioBadgeTexto: { fontSize: 12, fontWeight: '700', color: colors.navy },
});
