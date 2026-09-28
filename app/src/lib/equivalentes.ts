import { CoberturaPorIrmaos, IrmaoEmEstoque } from '../types/domain';

// Quantos dias de giro o estoque dos OUTROS cadastros do mesmo produto
// precisa aguentar pra o item zerado deixar de ser tratado como falta.
// Espelha o "7" da query de coletor/whatsapp_estoque_giro_alto_zerado.n8n.json
// — mudar aqui exige mudar lá.
export const COBERTURA_MIN_DIAS = 7;

export interface IrmaosBrutos {
  estoqueIrmaos: number;
  codigosGrupo: number[];
  irmaos: IrmaoEmEstoque[];
}

// "Tem irmão com estoque" não é "está coberto": vários casos têm 1 a 3
// unidades, que não seguram uma semana de venda. A cobertura compara o
// estoque dos irmãos com o giro do GRUPO INTEIRO (todos os códigos do
// mesmo produto somados) — depois que o comprador troca de laboratório,
// a venda migra pro código novo, então o giro do código antigo sozinho
// subestima a demanda real.
export function calcularCobertura(
  brutos: IrmaosBrutos,
  giro30dPorProduto: Map<number, number>
): CoberturaPorIrmaos {
  const giroGrupo30d = brutos.codigosGrupo.reduce((soma, codigo) => soma + (giro30dPorProduto.get(codigo) ?? 0), 0);
  const coberturaDias = giroGrupo30d > 0 ? brutos.estoqueIrmaos / (giroGrupo30d / 30) : null;
  return {
    estoqueIrmaos: brutos.estoqueIrmaos,
    coberturaDias: coberturaDias == null ? null : Math.round(coberturaDias * 10) / 10,
    // sem giro nenhum no grupo, qualquer estoque de irmão já é cobertura
    coberto: brutos.estoqueIrmaos > 0 && (coberturaDias == null || coberturaDias >= COBERTURA_MIN_DIAS),
    irmaos: brutos.irmaos,
  };
}

export function textoCobertura(cobertura: CoberturaPorIrmaos): string {
  const principal = cobertura.irmaos[0];
  if (!principal) return '';
  const resto = cobertura.irmaos.length - 1;
  const nome = `${principal.nome} (${principal.estoque} un.)${resto > 0 ? ` +${resto}` : ''}`;
  const dias = cobertura.coberturaDias != null ? ` · dá ~${Math.floor(cobertura.coberturaDias)} dias de giro` : '';
  return `${nome}${dias}`;
}
