import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import { alertar } from '../lib/alert';

const WHATSAPP_SUPORTE = '85988503418';

async function abrirWhatsAppSuporte() {
  const url = buildWhatsAppUrl(WHATSAPP_SUPORTE, 'Olá, estou com problema pra fazer login no app.');
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    alertar('Não foi possível abrir o WhatsApp', 'Verifique se o WhatsApp está instalado.');
  }
}

// Vendedor loga só com usuário (sem "@") — a Trier não tem e-mail
// cadastrado pra ninguém, então a conta é criada com um e-mail interno
// fake (usuario@farmapp.local, nunca recebe e-mail de verdade) e a
// pessoa nem precisa saber que isso existe por trás. Gestor continua
// digitando o e-mail real normalmente (já tem "@", passa direto).
function credencialLogin(digitado: string): string {
  const valor = digitado.trim();
  return valor.includes('@') ? valor : `${valor.toLowerCase()}@farmapp.local`;
}

export function LoginScreen() {
  const { signIn, signingIn, error } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <Image
          source={require('../../assets/conviva.jpg')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.card}>
          <Text style={styles.title}>Entrar</Text>

          <TextInput
            style={styles.input}
            placeholder="Usuário ou e-mail"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, signingIn && styles.buttonDisabled]}
            onPress={() => signIn(credencialLogin(email), senha)}
            disabled={signingIn}
          >
            {signingIn ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Problema no login, mande um{' '}
            <Text style={styles.whatsappLink} onPress={abrirWhatsAppSuporte}>
              WhatsApp
            </Text>
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.navy,
  },
  logo: { width: '100%', height: 130, marginBottom: 28 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.white, fontWeight: '600', fontSize: 16 },
  error: { color: colors.red, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 20, lineHeight: 18 },
  whatsappLink: { color: colors.success, fontWeight: '700' },
});
