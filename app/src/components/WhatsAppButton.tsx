import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alertar } from '../lib/alert';
import { buildWhatsAppUrl } from '../lib/whatsapp';

interface WhatsAppButtonProps {
  telefone: string;
  mensagem: string;
  compact?: boolean;
}

export function WhatsAppButton({ telefone, mensagem, compact }: WhatsAppButtonProps) {
  const abrir = async () => {
    const url = buildWhatsAppUrl(telefone, mensagem);
    if (!url) {
      alertar('Telefone inválido', 'Não foi possível reconhecer o formato desse número.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      // cai aqui em web sem handler de wa.me, ou celular sem o
      // WhatsApp instalado — Linking.openURL rejeita a promise.
      alertar('Não foi possível abrir o WhatsApp', 'Verifique se o WhatsApp está instalado.');
    }
  };

  return (
    <Pressable style={[styles.button, compact && styles.buttonCompact]} onPress={abrir} hitSlop={8}>
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
