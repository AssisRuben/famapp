import { Alert, Platform } from 'react-native';

// Alert.alert() no react-native-web é um no-op literal (ver
// node_modules/react-native-web/src/exports/Alert/index.js) — clicar
// num botão que só chamava Alert.alert parecia "não fazer nada" no
// navegador. Estas funções caem pra window.alert/window.confirm no
// web e usam o Alert nativo normalmente no celular.

export function alertar(titulo: string, mensagem?: string): void {
  if (Platform.OS === 'web') {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
    return;
  }
  Alert.alert(titulo, mensagem);
}

interface ConfirmarOpcoes {
  textoConfirmar?: string;
  textoCancelar?: string;
  destrutivo?: boolean;
}

export function confirmar(
  titulo: string,
  mensagem: string,
  onConfirmar: () => void,
  opcoes: ConfirmarOpcoes = {}
): void {
  const { textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', destrutivo = false } = opcoes;

  if (Platform.OS === 'web') {
    if (window.confirm(`${titulo}\n\n${mensagem}`)) {
      onConfirmar();
    }
    return;
  }

  Alert.alert(titulo, mensagem, [
    { text: textoCancelar, style: 'cancel' },
    { text: textoConfirmar, style: destrutivo ? 'destructive' : 'default', onPress: onConfirmar },
  ]);
}
