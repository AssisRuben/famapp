import { ContatoCliente, MotivoContato } from '../types/domain';

// Quanto tempo um cliente some da lista de um motivo depois de
// contatado, antes de poder reaparecer (se ainda se encaixar no
// critério — resgate/uso contínuo/alto valor/promoção saem sozinhos
// antes disso se o cliente comprar de novo, o número aqui é só o teto).
// Aniversário é diferente de propósito: 300 dias garante que só volta
// a aparecer no aniversário do ano seguinte, não dentro do mesmo ano
// (30 dias reapareceria enquanto ainda estivesse na janela de 7 dias
// antes da data, insistindo no mesmo aniversário várias vezes).
//
// 'antibiotico' fica de fora: não usa janela de tempo — uma vez
// contatado (ou marcado 'nao_contatado' pelo próprio app depois de 7
// dias sem ação), aquela venda de antimicrobiano fica resolvida pra
// sempre, não reaparece nunca mais. Ver existeRegistroContato abaixo.
export const JANELA_DIAS_POR_MOTIVO: Record<Exclude<MotivoContato, 'antibiotico'>, number> = {
  resgate: 30,
  uso_continuo: 30,
  alto_valor_sumindo: 30,
  promocao: 30,
  aniversario: 300,
};

// codigoProduto: omitir pra motivos sem produto (resgate/aniversário/
// alto_valor_sumindo); passar pra uso_continuo/promocao, onde o mesmo
// cliente pode estar "atrasado"/em promoção em produtos diferentes ao
// mesmo tempo — contatar sobre um não deve suprimir o outro.
export function foiContatadoRecentemente(
  contatos: ContatoCliente[],
  codigoCliente: number,
  motivo: Exclude<MotivoContato, 'antibiotico'>,
  codigoProduto?: number | null
): boolean {
  const limite = Date.now() - JANELA_DIAS_POR_MOTIVO[motivo] * 86400000;
  return contatos.some(
    (c) =>
      c.codigoCliente === codigoCliente &&
      c.motivo === motivo &&
      (codigoProduto == null || c.codigoProduto === codigoProduto) &&
      new Date(c.contatadoEm).getTime() >= limite
  );
}

// Existe ALGUM registro (contato de verdade ou 'nao_contatado'), sem
// olhar pra data — usado só pro motivo 'antibiotico', onde uma venda
// resolvida (de um jeito ou de outro) não deve voltar a aparecer.
export function existeRegistroContato(
  contatos: ContatoCliente[],
  codigoCliente: number,
  motivo: MotivoContato,
  codigoProduto?: number | null
): boolean {
  return contatos.some(
    (c) =>
      c.codigoCliente === codigoCliente &&
      c.motivo === motivo &&
      (codigoProduto == null || c.codigoProduto === codigoProduto)
  );
}
