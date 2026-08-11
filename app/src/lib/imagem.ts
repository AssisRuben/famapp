import * as ImagePicker from 'expo-image-picker';
import { alertar } from './alert';

export type OrigemImagem = 'camera' | 'galeria';

// Usado em qualquer lugar que precisa de foto/anexo (Receitas, Pendências)
// — cobre os dois jeitos de conseguir a imagem: tirar na hora ou escolher
// uma já existente da galeria.
export async function escolherImagem(origem: OrigemImagem, mensagemPermissao: string): Promise<string | null> {
  const permissao =
    origem === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    alertar('Permissão necessária', mensagemPermissao);
    return null;
  }

  const resultado =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
  if (resultado.canceled) return null;

  return resultado.assets?.[0]?.uri ?? null;
}
