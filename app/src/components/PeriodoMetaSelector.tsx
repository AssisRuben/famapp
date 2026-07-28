import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type PeriodoMeta = 'dia' | 'semana' | 'mes';

const OPCOES: { key: PeriodoMeta; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
];

interface PeriodoMetaSelectorProps {
  value: PeriodoMeta;
  onChange: (periodo: PeriodoMeta) => void;
}

export function PeriodoMetaSelector({ value, onChange }: PeriodoMetaSelectorProps) {
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
