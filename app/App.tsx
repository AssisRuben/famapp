// precisa ser o primeiro import — supabase-js usa URL/fetch que o
// Hermes (motor JS do RN) não implementa por padrão.
import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { aplicarCorrecaoLayoutWeb } from './src/lib/webLayoutFix';
import { verificarAtualizacaoAutomatica } from './src/lib/autoUpdate';

aplicarCorrecaoLayoutWeb();

export default function App() {
  useEffect(() => {
    verificarAtualizacaoAutomatica();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
