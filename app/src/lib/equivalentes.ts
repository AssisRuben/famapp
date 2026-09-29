import { AlternativaCompra, CoberturaPorIrmaos, IrmaoEmEstoque, ProdutoCatalogo } from '../types/domain';

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

// "NOME (N un.)", com "[outra marca]" quando é equivalente de fase 2 —
// um formato só pra tela de faltas, relatório e planilhas.
function rotuloIrmao(irmao: IrmaoEmEstoque): string {
  return irmao.outraCaixa ? ' [outra caixa]' : irmao.outraMarca ? ' [outra marca]' : '';
}

export function descreverIrmao(irmao: IrmaoEmEstoque): string {
  return `${irmao.nome}${rotuloIrmao(irmao)} (${irmao.estoque} un.)`;
}

export function textoCobertura(cobertura: CoberturaPorIrmaos): string {
  const principal = cobertura.irmaos[0];
  if (!principal) return '';
  const resto = cobertura.irmaos.length - 1;
  const nome = `${principal.nome}${rotuloIrmao(principal)} (${principal.estoque} un.)${resto > 0 ? ` +${resto}` : ''}`;
  const dias = cobertura.coberturaDias != null ? ` · dá ~${Math.floor(cobertura.coberturaDias)} dias de giro` : '';
  return `${nome}${dias}`;
}

// ============================================================
// Fase 2 (29/09/2026): OUTRA MARCA do mesmo medicamento e apresentação
// (mesma produto_catalogo.chave_equivalencia — calculada no coletor,
// ver coletor/chaveEquivalencia.js). Complementa os irmãos de nome
// idêntico acima: os dois contam como cobertura e somam no mesmo
// IrmaosBrutos.
// ============================================================

// Faixa terapêutica estreita: trocar de marca/laboratório exige
// acompanhamento médico — outra marca NÃO conta como cobertura nem entra
// na alternativa de compra. Espelha troca_restrita de
// vw_produto_equivalentes (supabase/migracao_chave_equivalencia.sql) —
// mudar aqui exige mudar lá.
const TROCA_RESTRITA =
  /LEVOTIROXINA|VARFARINA|FENITOINA|CARBAMAZEPINA|CARBONATO DE LITIO|DIGOXINA|CICLOSPORINA|TACROLIMO|VALPRO|DIVALPROEX|LAMOTRIGINA|TEOFILINA|FENOBARBITAL/;

export function ehTrocaRestrita(chave: string | null | undefined): boolean {
  return !!chave && TROCA_RESTRITA.test(chave.split('|')[0]);
}

export function agruparPorChaveEquivalencia(catalogo: ProdutoCatalogo[]): Map<string, ProdutoCatalogo[]> {
  const grupos = new Map<string, ProdutoCatalogo[]>();
  for (const produto of catalogo) {
    if (!produto.chaveEquivalencia) continue;
    const lista = grupos.get(produto.chaveEquivalencia);
    if (lista) lista.push(produto);
    else grupos.set(produto.chaveEquivalencia, [produto]);
  }
  return grupos;
}

function outrasMarcas(produto: ProdutoCatalogo, grupos: Map<string, ProdutoCatalogo[]>): ProdutoCatalogo[] {
  if (!produto.chaveEquivalencia || ehTrocaRestrita(produto.chaveEquivalencia)) return [];
  return (grupos.get(produto.chaveEquivalencia) ?? []).filter((p) => p.codigo !== produto.codigo);
}

// Outras marcas COM estoque, no mesmo formato dos irmãos de nome
// (null quando não há nenhuma) — pra somar com mesclarCobertura.
export function equivalentesEmEstoque(
  produto: ProdutoCatalogo,
  grupos: Map<string, ProdutoCatalogo[]>
): IrmaosBrutos | null {
  const outras = outrasMarcas(produto, grupos);
  const comEstoque = outras.filter((p) => p.estoqueAtual > 0).sort((a, b) => b.estoqueAtual - a.estoqueAtual);
  if (comEstoque.length === 0) return null;
  return {
    estoqueIrmaos: comEstoque.reduce((soma, p) => soma + p.estoqueAtual, 0),
    codigosGrupo: [produto.codigo, ...outras.map((p) => p.codigo)],
    irmaos: comEstoque.map((p) => ({ codigo: p.codigo, nome: p.nome, estoque: p.estoqueAtual, outraMarca: true })),
  };
}

// Junta irmãos de nome (fase 1) e outras marcas (fase 2) sem contar o
// mesmo cadastro duas vezes (um irmão de nome idêntico também tem a
// mesma chave de equivalência).
export function mesclarCobertura(a: IrmaosBrutos | null | undefined, b: IrmaosBrutos | null | undefined): IrmaosBrutos | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const porCodigo = new Map<number, IrmaoEmEstoque>();
  for (const irmao of [...a.irmaos, ...b.irmaos]) if (!porCodigo.has(irmao.codigo)) porCodigo.set(irmao.codigo, irmao);
  const irmaos = [...porCodigo.values()].sort((x, y) => y.estoque - x.estoque);
  return {
    estoqueIrmaos: irmaos.reduce((soma, i) => soma + i.estoque, 0),
    codigosGrupo: [...new Set([...a.codigosGrupo, ...b.codigosGrupo])],
    irmaos,
  };
}

// Só vale mostrar como alternativa se sai pelo menos isso mais barato
// por unidade — diferença de centavos não compensa trocar de fornecedor.
const ECONOMIA_MINIMA_PCT = 5;

// Outra marca da mesma apresentação com custo médio menor (a mais
// barata), pra sugerir na compra. Custo médio é o que a farmácia pagou
// de fato — não é cotação atual (a API da Trier não expõe cotação).
export function alternativaMaisBarata(
  produto: ProdutoCatalogo,
  grupos: Map<string, ProdutoCatalogo[]>
): AlternativaCompra | null {
  if (!(produto.custoMedio > 0)) return null;
  const candidata = outrasMarcas(produto, grupos)
    .filter((p) => p.custoMedio > 0)
    .sort((a, b) => a.custoMedio - b.custoMedio)[0];
  if (!candidata) return null;
  const economiaUnitaria = produto.custoMedio - candidata.custoMedio;
  if ((economiaUnitaria / produto.custoMedio) * 100 < ECONOMIA_MINIMA_PCT) return null;
  return {
    codigo: candidata.codigo,
    nome: candidata.nome,
    grupo: candidata.grupo ?? '',
    custoMedio: candidata.custoMedio,
    economiaUnitaria: Math.round(economiaUnitaria * 100) / 100,
  };
}

// ============================================================
// Outra CAIXA (29/09/2026, pedido do gestor): mesmo remédio, dose, forma
// e modificadores, só a quantidade na embalagem muda (Quetiapina 100mg
// 30cp cobre Quetros 100mg 60cp). Usado SÓ na lista "Estoque zerado —
// giro alto" (tem ou não tem na farmácia) — não na compra, que é por
// apresentação. Fica de fora:
// - controlado/antimicrobiano: a receita fixa a quantidade, o balcão
//   nem sempre pode trocar 20 comprimidos por 30;
// - troca restrita (faixa terapêutica estreita).
// Espelha a 3ª fonte do lateral "cob" em
// coletor/whatsapp_estoque_giro_alto_zerado.n8n.json.
// ============================================================
function chaveSemQuantidade(chave: string): string {
  return chave.slice(0, chave.lastIndexOf('|'));
}

function ehControlado(produto: ProdutoCatalogo): boolean {
  const grupo = (produto.grupo ?? '').toUpperCase();
  return !!produto.tipoLista?.trim() || grupo.includes('CONTROLAD') || grupo.includes('ANTIMICROB');
}

export function agruparPorChaveSemQuantidade(catalogo: ProdutoCatalogo[]): Map<string, ProdutoCatalogo[]> {
  const grupos = new Map<string, ProdutoCatalogo[]>();
  for (const produto of catalogo) {
    if (!produto.chaveEquivalencia) continue;
    const base = chaveSemQuantidade(produto.chaveEquivalencia);
    const lista = grupos.get(base);
    if (lista) lista.push(produto);
    else grupos.set(base, [produto]);
  }
  return grupos;
}

export function outrasCaixasEmEstoque(
  produto: ProdutoCatalogo,
  gruposSemQuantidade: Map<string, ProdutoCatalogo[]>
): IrmaosBrutos | null {
  const chave = produto.chaveEquivalencia;
  if (!chave || ehControlado(produto) || ehTrocaRestrita(chave)) return null;
  const outras = (gruposSemQuantidade.get(chaveSemQuantidade(chave)) ?? []).filter(
    (p) => p.chaveEquivalencia !== chave && p.estoqueAtual > 0
  );
  if (outras.length === 0) return null;
  return {
    estoqueIrmaos: outras.reduce((soma, p) => soma + p.estoqueAtual, 0),
    codigosGrupo: [produto.codigo, ...outras.map((p) => p.codigo)],
    irmaos: outras.map((p) => ({ codigo: p.codigo, nome: p.nome, estoque: p.estoqueAtual, outraCaixa: true })),
  };
}
