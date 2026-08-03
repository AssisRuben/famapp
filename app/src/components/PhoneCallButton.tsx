import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alertar } from '../lib/alert';
import { colors } from '../theme/colors';

interface PhoneCallButtonProps {
  telefone: string;
  compact?: boolean;
  // Chamado só depois que o discador abre com sucesso — usado pra
  // registrar a tentativa de contato (ver lib/contatos.ts).
  onLigar?: () => void;
}

// tel:<dígitos> abre o discador nativo com o número já preenchido, sem
// discar sozinho — a pessoa ainda decide se aperta pra ligar de
// verdade (mesmo comportamento que "ir pro teclado do telefone
// carregado" pedido).
export function PhoneCallButton({ telefone, compact, onLigar }: PhoneCallButtonProps) {
  const ligar = async () => {
    const digits = telefone.replace(/\D/g, '');
    if (!digits) {
      alertar('Telefone inválido', 'Não foi possível reconhecer o formato desse número.');
      return;
    }
    try {
      await Linking.openURL(`tel:${digits}`);
      onLigar?.();
    } catch {
      alertar('Não foi possível abrir o discador', 'Verifique se o dispositivo suporta chamadas.');
    }
  };

  return (
    <Pressable style={[styles.button, compact && styles.buttonCompact]} onPress={ligar} hitSlop={8}>
      <Ionicons name="call" size={compact ? 18 : 16} color="#FFFFFF" />
      {!compact && <Text style={styles.label}>Ligar</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
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
