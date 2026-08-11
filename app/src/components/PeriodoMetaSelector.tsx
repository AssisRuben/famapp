import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export type PeriodoMeta = 'dia' | 'semana' | 'mes';

const OPCOES: { key: PeriodoMeta; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
];

interface PeriodoMetaSelectorProps {
  // null = nenhum dos 3 ativo (ex.: card Desempenho com um período
  // customizado escolhido no calendário, 11/08/2026).
  value: PeriodoMeta | null;
  onChange: (periodo: PeriodoMeta) => void;
  // 4º segmento opcional, dentro do MESMO grupo visual dos 3 tabs (ex.:
  // botão de calendário do card Desempenho) — sem isso, o resto do
  // seletor (Metas) fica intocado.
  extra?: {
    ativo: boolean;
    icone: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
  };
}

export function PeriodoMetaSelector({ value, onChange, extra }: PeriodoMetaSelectorProps) {
  return (
    <View style={styles.wrap}>
      {OPCOES.map((opcao) => (
        <Pressable
          key={opcao.key}
          style={[styles.btn, value === opcao.key && styles.btnAtivo]}
          onPress={() => onChange(opcao.key)}
        >
          <Text style={[styles.txt, value === opcao.key && styles.txtAtivo]}>{opcao.label}</Text>
        </Pressable>
      ))}
      {extra && (
        <Pressable style={[styles.btn, extra.ativo && styles.btnAtivo]} onPress={extra.onPress}>
          <Ionicons name={extra.icone} size={15} color={extra.ativo ? colors.white : colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  btn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  btnAtivo: { backgroundColor: colors.navy },
  txt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  txtAtivo: { color: colors.white },
});
