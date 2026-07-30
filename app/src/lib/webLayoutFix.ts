import { Platform } from 'react-native';
import { colors } from '../theme/colors';

// Metro (Expo web, SDK 50+) serve um index.html padrão sem reset de
// html/body/#root — sem isso, o body pode ficar mais largo que a
// viewport (por causa da largura da scrollbar) e cortar conteúdo do
// lado direito (título, botão de menu, texto). Corrige uma única vez,
// no boot do app; sem efeito em iOS/Android (Platform.OS !== 'web').
export function aplicarCorrecaoLayoutWeb(): void {
  if (Platform.OS !== 'web') return;

  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {
      height: 100%;
      width: 100%;
      margin: 0;
      overflow-x: hidden;
    }
    body {
      background-color: ${colors.background};
    }
  `;
  document.head.appendChild(style);
}
