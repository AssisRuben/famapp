// Cache em memória (module-level, some com o app fechado) pra telas
// pesadas mostrarem o último resultado na hora ao reabrir, em vez de
// tela em branco/spinner toda vez — o fetch de verdade continua
// rodando por trás e atualiza o cache quando terminar
// (stale-while-revalidate). Não persiste em disco de propósito: o
// ganho que importa é não refazer tudo do zero ao trocar de aba
// dentro da mesma sessão, não sobreviver a fechar o app.
const cache = new Map<string, unknown>();

export function cacheGet<T>(chave: string): T | undefined {
  return cache.get(chave) as T | undefined;
}

export function cacheSet<T>(chave: string, dados: T): void {
  cache.set(chave, dados);
}
