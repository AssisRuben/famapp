import { CampanhaProduto, GrupoCartazete } from '../types/domain';

// Heurística: separa um sufixo de "variante" (tamanho/medida) do
// nome do produto — ex.: "Fralda Pampers Pants Giga G72" -> base
// "Fralda Pampers Pants Giga", variante "G72". É só uma heurística de
// texto (não tem campo de "variante" estruturado vindo da Trier),
// então produtos sem família viram grupo de 1 item — nesse caso o
// nome completo é preservado como está (ver agruparParaCartazetes).
const REGEX_VARIANTE = /^(.*?)\s+((?:X{0,3}G|PP|P|M)\d*|\d+(?:ML|G|MG|UN|L|KG)?)$/i;

function separarNomeEVariante(nome: string): { nomeBase: string; variante: string } {
  const match = nome.trim().match(REGEX_VARIANTE);
  if (match && match[1].trim().length > 0) {
    return { nomeBase: match[1].trim(), variante: match[2].trim().toUpperCase() };
  }
  return { nomeBase: nome.trim(), variante: '' };
}

// Um cartaz por (nome-base + preço promocional + validade) — o mesmo
// produto em tamanhos/variações diferentes vira UM cartaz listando as
// variantes, replicando o exemplo real (5 códigos de barra de Fralda
// Pampers Pants Giga viram 1 cartaz só). A validade agora entra na
// chave do grupo porque cada item pode ter a própria validade editada
// na tela de Cartazetes — dois itens com preço igual mas validade
// diferente não podem virar um cartaz só (teriam uma única linha de
// validade pra mostrar, e ela mentiria pra um dos dois).
export function agruparParaCartazetes(produtos: CampanhaProduto[]): GrupoCartazete[] {
  const grupos = new Map<string, GrupoCartazete>();

  for (const produto of produtos) {
    const { nomeBase, variante } = separarNomeEVariante(produto.nomeProduto);
    const chave = `${nomeBase}__${produto.precoPromocional}__${produto.dataInicio}__${produto.dataFim}`;
    const existente = grupos.get(chave);

    if (existente) {
      if (variante && !existente.variantes.includes(variante)) existente.variantes.push(variante);
      existente.produtos.push(produto);
      existente.quantidadeCartazes += produto.quantidadeCartazes;
    } else {
      grupos.set(chave, {
        chave,
        nomeBase,
        variantes: variante ? [variante] : [],
        precoPromocional: produto.precoPromocional,
        percentualDesconto: produto.percentualDesconto,
        dataInicio: produto.dataInicio,
        dataFim: produto.dataFim,
        quantidadeCartazes: produto.quantidadeCartazes,
        produtos: [produto],
      });
    }
  }

  // grupo de 1 item só não é família de variantes — mostra o nome
  // completo em vez de um "recorte" estranho (ex.: separar "10ml"
  // como se fosse tamanho de uma linha à parte).
  for (const grupo of grupos.values()) {
    if (grupo.produtos.length === 1) {
      grupo.nomeBase = grupo.produtos[0].nomeProduto;
      grupo.variantes = [];
    }
  }

  return Array.from(grupos.values()).sort((a, b) => a.nomeBase.localeCompare(b.nomeBase));
}
