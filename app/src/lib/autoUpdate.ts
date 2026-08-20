import * as Updates from 'expo-updates';
import { withTimeout } from './timeout';

// Por padrão o expo-updates baixa update novo no boot mas só aplica no
// PRÓXIMO cold start — em wifi de farmácia isso vira dias numa versão
// antiga até alguém fechar o app de verdade (não só minimizar). Aqui a
// gente força check + fetch + reload já nessa abertura, com timeout em
// cada etapa pra nunca travar o boot se a rede estiver ruim (nesse caso
// só falha em silêncio e o app abre normal na versão que já tinha).
export function verificarAtualizacaoAutomatica(): void {
  if (__DEV__ || !Updates.isEnabled) return;

  withTimeout(Updates.checkForUpdateAsync(), 8000, 'timeout ao checar atualização')
    .then((resultado) => {
      if (!resultado.isAvailable) return null;
      return withTimeout(Updates.fetchUpdateAsync(), 30000, 'timeout ao baixar atualização');
    })
    .then((fetchResult) => {
      if (fetchResult?.isNew) return Updates.reloadAsync();
    })
    .catch(() => {});
}
