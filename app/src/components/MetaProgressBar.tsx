import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';

interface MetaProgressBarProps {
  label: string;
  valorRealizado: number;
  valorMeta: number;
}

export function MetaProgressBar({ label, valorRealizado, valorMeta }: MetaProgressBarProps) {
  const pct = valorMeta > 0 ? (valorRealizado / valorMeta) * 100 : 0;
  const atingiu = pct >= 100;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.pct, atingiu && styles.pctOk]}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(pct, 100)}%` },
            atingiu && styles.fillOk,
          ]}
        />
      </View>
      <Text style={styles.valores}>
        {formatBRL(valorRealizado)} de {formatBRL(valorMeta)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flexShrink: 1, marginRight: 8 },
  pct: { fontSize: 13, fontWeight: '700', color: colors.navy },
  pctOk: { color: colors.success },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.navy },
  fillOk: { backgroundColor: colors.success },
  valores: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
});
