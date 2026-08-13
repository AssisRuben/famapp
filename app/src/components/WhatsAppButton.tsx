import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alertar } from '../lib/alert';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import { useAuth } from '../context/AuthContext';
import { carregarStatusWhatsApp, statusWhatsAppEmCache } from '../lib/whatsappStatus';

interface WhatsAppButtonProps {
  telefone: string;
  mensagem: string;
  compact?: boolean;
  // Código do cliente, pra cruzar com o resultado real de
  // clientes.tem_whatsapp (ver lib/whatsappStatus.ts). Sem isso (ou
  // enquanto ainda não carregou/não foi checado pra esse cliente), cai
  // no fallback de só validar o formato do telefone.
  codigoCliente?: number;
  // Chamado só depois que o link abre com sucesso — usado pra
  // registrar a tentativa de contato (ver lib/contatos.ts). Não
  // dispara se o telefone for inválido ou o WhatsApp não abrir.
  onEnviado?: () => void;
}

export function WhatsAppButton({ telefone, mensagem, compact, codigoCliente, onEnviado }: WhatsAppButtonProps) {
  const { profile } = useAuth();
  const [statusMap, setStatusMap] = useState(statusWhatsAppEmCache());

  useEffect(() => {
    if (statusMap || !profile) return;
    carregarStatusWhatsApp(profile)
      .then(setStatusMap)
      .catch(() => {}); // sem sorte, fica no fallback de formato mesmo
  }, [profile, statusMap]);

  // Formato válido é o fallback pra quem ainda não foi checado contra a
  // Evolution API (codigoCliente ausente do mapa) — checagem real
  // sempre tem prioridade quando disponível, pra cima (habilita mesmo
  // com formato estranho) ou pra baixo (desabilita mesmo com formato ok,
  // ex.: telefone fixo).
  const temWhatsappReal = codigoCliente != null ? statusMap?.[codigoCliente] : undefined;
  const validoFormato = buildWhatsAppUrl(telefone, '') !== null;
  const valido = temWhatsappReal ?? validoFormato;

  const abrir = async () => {
    const url = buildWhatsAppUrl(telefone, mensagem);
    if (!url) {
      alertar('Telefone inválido', 'Não foi possível reconhecer o formato desse número.');
      return;
    }
    try {
      await Linking.openURL(url);
      onEnviado?.();
    } catch {
      // cai aqui em web sem handler de wa.me, ou celular sem o
      // WhatsApp instalado — Linking.openURL rejeita a promise.
      alertar('Não foi possível abrir o WhatsApp', 'Verifique se o WhatsApp está instalado.');
    }
  };

  return (
    <Pressable
      style={[styles.button, compact && styles.buttonCompact, !valido && styles.buttonInvalido]}
      onPress={abrir}
      disabled={!valido}
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
  buttonInvalido: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
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
