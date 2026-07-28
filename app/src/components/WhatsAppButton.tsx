import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildWhatsAppUrl } from '../lib/whatsapp';

interface WhatsAppButtonProps {
  telefone: string;
  mensagem: string;
  compact?: boolean;
}

export function WhatsAppButton({ telefone, mensagem, compact }: WhatsAppButtonProps) {
  return (
    <Pressable
      style={[styles.button, compact && styles.buttonCompact]}
      onPress={() => Linking.openURL(buildWhatsAppUrl(telefone, mensagem))}
      hitSlop={8}
    >
      <Ionicons name="logo-whatsapp" size={compact ? 18 : 16} color="#FFFFFF" />
      {!compact && <Text style={styles.label}>WhatsApp</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  buttonCompact: {
    width: 36,
    height: 36,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});
