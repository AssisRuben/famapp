// supabase-js e expo-updates não têm timeout embutido nas chamadas de
// rede — numa rede ruim (ex.: wifi público com portal cativo) a promise
// nunca resolve nem rejeita, e a tela de loading trava pra sempre.
export function withTimeout<T>(promise: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensagem)), ms);
    promise.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      }
    );
  });
}
