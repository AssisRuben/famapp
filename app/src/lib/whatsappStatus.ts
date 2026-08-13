import { repository } from '../data';
import { Profile } from '../types/domain';

// Singleton por sessão do app (não por componente) — várias instâncias
// de WhatsAppButton na tela (lista de clientes) compartilham a mesma
// promise em vez de cada uma disparar a própria query paginada.
let promiseEmAndamento: Promise<Record<number, boolean>> | null = null;
let mapaCarregado: Record<number, boolean> | null = null;

export function statusWhatsAppEmCache(): Record<number, boolean> | null {
  return mapaCarregado;
}

export function carregarStatusWhatsApp(profile: Profile): Promise<Record<number, boolean>> {
  if (mapaCarregado) return Promise.resolve(mapaCarregado);
  if (!promiseEmAndamento) {
    promiseEmAndamento = repository
      .getStatusWhatsApp(profile)
      .then((mapa) => {
        mapaCarregado = mapa;
        return mapa;
      })
      .catch((erro) => {
        promiseEmAndamento = null; // permite tentar de novo na próxima chamada
        throw erro;
      });
  }
  return promiseEmAndamento;
}
