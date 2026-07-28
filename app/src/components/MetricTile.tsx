import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface MetricTileProps {
  label: string;
  value: string;
  accentColor?: string;
}

export function MetricTile({ label, value, accentColor = colors.navy }: MetricTileProps) {
  return (
    <View style={styles.tile}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.textWrap}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    width: '48%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
  textWrap: { flexShrink: 1 },
  value: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  label: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
