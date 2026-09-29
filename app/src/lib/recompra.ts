import { ConversaoUsoContinuo, ProdutoRecorrenteCliente } from '../types/domain';

// Complemento da linha "a cada ~30d, já são 28d" (30/09/2026):
// quando está na hora de recomprar, diz se vence em breve ou já passou;
// remédio com receita/controlado vira só lembrete (sem oferta — mesma
// regra das campanhas).
export function statusRecompra(p: ProdutoRecorrenteCliente): string {
  if (!p.atrasado || p.diasParaPrevisao == null) return '';
  const d = p.diasParaPrevisao;
  const quando = d > 0 ? `vence em ${d}d` : d === 0 ? 'vence hoje' : `atrasado ${-d}d`;
  return ` · ${quando}${p.exigeReceita ? ' · só lembrete (receita)' : ''}`;
}

export function textoConversao(c: ConversaoUsoContinuo): string {
  if (c.contatos === 0) return 'Últimos 30 dias: nenhum contato de uso contínuo ainda.';
  const pct = Math.round((c.convertidos / c.contatos) * 100);
  return `Últimos 30 dias: ${c.contatos} contato(s) · ${c.convertidos} comprou(aram) em até 7 dias (${pct}%)`;
}
