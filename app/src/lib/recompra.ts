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

// "Próximas compras prováveis" do cliente (30/09/2026): os remédios de
// uso contínuo dele com previsão, do mais próximo pro mais distante.
// Atrasado há mais de 15 dias fica de fora (mesma regra da lista de
// recompra — provavelmente parou ou trocou de farmácia).
export function proximasCompras(produtos: ProdutoRecorrenteCliente[], codigoCliente: number, limite = 5): ProdutoRecorrenteCliente[] {
  const vistos = new Set<number>();
  return produtos
    .filter((p) => p.codigoCliente === codigoCliente && p.diasParaPrevisao != null && p.diasParaPrevisao >= -15)
    .sort((a, b) => (a.diasParaPrevisao ?? 0) - (b.diasParaPrevisao ?? 0))
    // "Meus clientes" pode trazer o mesmo remédio uma vez por vendedor
    .filter((p) => (vistos.has(p.codigoProduto) ? false : (vistos.add(p.codigoProduto), true)))
    .slice(0, limite);
}

export function quandoPrevisto(diasParaPrevisao: number): string {
  if (diasParaPrevisao > 0) return `prevista em ${diasParaPrevisao}d`;
  if (diasParaPrevisao === 0) return 'prevista para hoje';
  return `atrasada ${-diasParaPrevisao}d`;
}
