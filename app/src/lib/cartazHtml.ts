import { GrupoCartazete, KitMultiProduto } from '../types/domain';
import { formatBRL } from './format';
import { descricaoKit, descricaoKitMultiProduto } from './kits';
import { MASCOTE_CONVIVA_BASE64 } from '../assets/mascoteConvivaBase64';

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

function formatarValidade(dataInicioIso: string, dataFimIso: string): string {
  const inicio = new Date(`${dataInicioIso}T00:00:00`);
  const fim = new Date(`${dataFimIso}T00:00:00`);

  if (inicio.getMonth() === fim.getMonth() && inicio.getFullYear() === fim.getFullYear()) {
    return `${inicio.getDate()} A ${fim.getDate()} ${MESES[fim.getMonth()]} ${fim.getFullYear()}`;
  }
  const mesInicio = String(inicio.getMonth() + 1).padStart(2, '0');
  const mesFim = String(fim.getMonth() + 1).padStart(2, '0');
  return `${inicio.getDate()}/${mesInicio} A ${fim.getDate()}/${mesFim}/${fim.getFullYear()}`;
}

function escapeHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function cartazHtml(grupo: GrupoCartazete): string {
  const validade = formatarValidade(grupo.dataInicio, grupo.dataFim);
  const variantesHtml = grupo.variantes.length
    ? `<div class="variantes">${grupo.variantes.map(escapeHtml).join(' / ')}</div>`
    : '';

  // Código reduzido do primeiro produto do grupo — pra famílias com
  // várias variantes, o cartaz é um só (ver agruparParaCartazetes), então
  // exibe o código do item que representa o grupo.
  const codigoReduzido = grupo.produtos[0]?.codigoProduto;
  const codigoHtml = codigoReduzido ? ` <span class="codigo">(${codigoReduzido})</span>` : '';

  // "De" vem do preço regular do produto (puxado do catálogo/API na tela
  // de Campanhas, editável em Cartazetes). Ainda não existe um "preço de
  // referência" histórico calculado de verdade — quando existir, é só
  // trocar a origem desse valor aqui.
  const precoDe = grupo.produtos[0]?.precoRegular ?? grupo.precoPromocional;
  const temDesconto = grupo.percentualDesconto > 0;
  const precoDeHtml = temDesconto
    ? `<div class="preco-de">DE <span class="preco-de-valor">${escapeHtml(formatBRL(precoDe))}</span></div>`
    : '';
  const descontoBadgeHtml = temDesconto
    ? `<div class="desconto-badge">${grupo.percentualDesconto.toFixed(0)}% OFF</div>`
    : '';

  // Promoção "kit" (18/08/2026, ex.: "compre 3 pague 2") substitui o
  // DE/POR pelo texto do kit — o desconto aqui não é por unidade, é
  // por levar mais de um, então mostrar "%OFF" isolado confundiria.
  const primeiroProduto = grupo.produtos[0];
  const kit = primeiroProduto?.tipoPromocao === 'kit' ? primeiroProduto.kit : null;
  const faixaPrecoHtml = kit
    ? `<div class="kit-titulo">${escapeHtml(descricaoKit(kit).toUpperCase())}</div>
       <div class="preco-linha">
         <span class="preco-por-label">CADA</span>
         <span class="preco">${escapeHtml(formatBRL(precoDe))}</span>
       </div>`
    : `${descontoBadgeHtml}
       ${precoDeHtml}
       <div class="preco-linha">
         <span class="preco-por-label">POR</span>
         <span class="preco">${escapeHtml(formatBRL(grupo.precoPromocional))}</span>
       </div>
       <span class="cada">CADA</span>`;

  return `
    <div class="cartaz">
      <div class="faixa-oferta"><span class="oferta-texto">OFERTA</span></div>
      <div class="corpo">
        <div class="nome-produto">${escapeHtml(grupo.nomeBase)}${codigoHtml}</div>
        ${variantesHtml}
      </div>
      <div class="faixa-preco">
        ${faixaPrecoHtml}
      </div>
      <div class="rodape-info">
        <div class="rodape-textos">
          <div class="validade">OFERTA VÁLIDA DE ${validade}.</div>
          <div class="disclaimer">SUJEITA A DISPONIBILIDADE DE ESTOQUE.</div>
        </div>
        <img class="mascote" src="${MASCOTE_CONVIVA_BASE64}" alt="" />
      </div>
      <div class="marca">
        <div class="marca-nome">Farmácia Conviva Parquelândia</div>
        <div class="marca-tagline">Perto de você, ao lado da sua saúde.</div>
      </div>
    </div>`;
}

// Cartaz de kit multi-produto (afinidade de compra, 02/09/2026) —
// DIFERENTE de cartazHtml() acima: não tem um "nomeBase"/variantes (o
// kit já enumera os membros) nem um preço "por unidade" (o combo
// mistura produtos diferentes num preço/desconto só). Reaproveita o
// mesmo shell visual e as mesmas classes CSS (definidas mais abaixo em
// gerarHtmlCartazes), só troca o conteúdo do corpo/faixa-preço.
function kitMultiProdutoHtml(kit: KitMultiProduto): string {
  const validade = formatarValidade(kit.dataInicio, kit.dataFim);
  const nomeTitulo = kit.produtos.map((p) => p.nomeProduto).join(' + ');

  const totalRegular = kit.produtos.reduce((acc, p) => acc + p.precoRegular * p.quantidade, 0);
  const precoFinal =
    kit.tipoPrecificacao === 'preco_fixo'
      ? kit.precoFixo ?? totalRegular
      : totalRegular * (1 - (kit.percentualDescontoItem ?? 0) / 100);
  const percentualExibido = totalRegular > 0 ? Math.round(((totalRegular - precoFinal) / totalRegular) * 100) : 0;
  const temDesconto = percentualExibido > 0;

  // Sem desconto-badge aqui de propósito — ele é posicionado absoluto
  // no canto (pensado pro layout DE/POR de produto único) e sobrepõe a
  // primeira linha do kit-titulo, que pode ocupar 2-3 linhas com nome
  // de dois produtos. O percentual já está no texto do título, igual o
  // kit de produto único (cartazHtml acima) já decidia não duplicar.
  const faixaPrecoHtml = `<div class="kit-titulo">${escapeHtml(descricaoKitMultiProduto(kit).toUpperCase())}</div>
       ${
         temDesconto
           ? `<div class="preco-de">DE <span class="preco-de-valor">${escapeHtml(formatBRL(totalRegular))}</span></div>`
           : ''
       }
       <div class="preco-linha">
         <span class="preco-por-label">POR</span>
         <span class="preco">${escapeHtml(formatBRL(precoFinal))}</span>
       </div>`;

  return `
    <div class="cartaz">
      <div class="faixa-oferta"><span class="oferta-texto">OFERTA</span></div>
      <div class="corpo">
        <div class="nome-produto">${escapeHtml(nomeTitulo)}</div>
      </div>
      <div class="faixa-preco">
        ${faixaPrecoHtml}
      </div>
      <div class="rodape-info">
        <div class="rodape-textos">
          <div class="validade">OFERTA VÁLIDA DE ${validade}.</div>
          <div class="disclaimer">SUJEITA A DISPONIBILIDADE DE ESTOQUE.</div>
        </div>
        <img class="mascote" src="${MASCOTE_CONVIVA_BASE64}" alt="" />
      </div>
      <div class="marca">
        <div class="marca-nome">Farmácia Conviva Parquelândia</div>
        <div class="marca-tagline">Perto de você, ao lado da sua saúde.</div>
      </div>
    </div>`;
}

// Área útil de um cartaz "tamanho grande" (o design original, pensado
// pra A5 com 10mm de margem) — base fixa em mm usada pra calcular o
// fator de escala quando mais de 1 cartaz entra na mesma página A4.
const CARTAZ_LARGURA_MM = 128;
const CARTAZ_ALTURA_MM = 190;
const A4_MARGEM_MM = 10;
const A4_LARGURA_UTIL_MM = 210 - A4_MARGEM_MM * 2;
const A4_ALTURA_UTIL_MM = 297 - A4_MARGEM_MM * 2;

// Preset de colunas/linhas por densidade — cobre o caso comum de
// varejo (3 = poucos produtos, cartaz maior; 12 = muitos produtos,
// cartaz pequeno). Densidade não listada cai pro preset mais próximo.
//
// O cartaz é bem retrato (128x190mm, quase o mesmo formato da própria
// folha A4 útil). Por isso grades "quadradas" (colunas ≈ linhas)
// aproveitam MUITO melhor o espaço que grades alongadas — ex.: pra 3,
// uma grade 3x1 ou 1x3 deixava o cartaz bem menor; uma 2x2 (com 1
// célula vazia) rende um cartaz ~48% maior. Por isso alguns presets
// abaixo têm mais células do que a densidade pedida — o excedente fica
// em branco.
const PRESET_GRADE: Record<number, { colunas: number; linhas: number }> = {
  3: { colunas: 2, linhas: 2 }, // 1 célula sobra vazia
  6: { colunas: 3, linhas: 2 },
  9: { colunas: 3, linhas: 3 },
  12: { colunas: 4, linhas: 3 },
};

export type CartazesPorPagina = 3 | 6 | 9 | 12;

// Gera o HTML completo pronto pra passar pro expo-print. Cada grupo já
// veio agrupado por variante — ver src/lib/cartazetes.ts. Sempre A4 com
// uma grade, escalando o cartaz proporcionalmente (transform: scale)
// pra caber — mais cartazes por página = cartaz menor, útil quando tem
// muito produto pra imprimir.
export function gerarHtmlCartazes(
  grupos: GrupoCartazete[],
  kits: KitMultiProduto[] = [],
  cartazesPorPagina: CartazesPorPagina = 3
): string {
  const cartazesHtml = [
    ...grupos.flatMap((grupo) => Array.from({ length: Math.max(grupo.quantidadeCartazes, 1) }, () => cartazHtml(grupo))),
    ...kits.flatMap((kit) => Array.from({ length: Math.max(kit.quantidadeCartazes, 1) }, () => kitMultiProdutoHtml(kit))),
  ];

  const corpoHtml = gerarPaginasMultiplas(cartazesHtml, cartazesPorPagina);

  // fator de escala pra caber cartazesPorPagina cartazes (tamanho
  // original 128x190mm) numa grade A4 sem estourar a página.
  const { colunas, linhas } = PRESET_GRADE[cartazesPorPagina] ?? PRESET_GRADE[3];
  const celulaLarguraMm = A4_LARGURA_UTIL_MM / colunas;
  const celulaAlturaMm = A4_ALTURA_UTIL_MM / linhas;
  const escala = Math.min(celulaLarguraMm / CARTAZ_LARGURA_MM, celulaAlturaMm / CARTAZ_ALTURA_MM);

  const paginaCss = `@page { size: A4 portrait; margin: ${A4_MARGEM_MM}mm; }
  .pagina-grade {
    display: grid;
    grid-template-columns: repeat(${colunas}, 1fr);
    grid-template-rows: repeat(${linhas}, 1fr);
    width: 100%;
    height: ${A4_ALTURA_UTIL_MM}mm;
    page-break-after: always;
  }
  .celula-grade { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  /*
    transform: scale() só encolhe a PINTURA — a caixa continua ocupando
    o tamanho original (128x190mm) pro cálculo de layout/overflow do
    grid. Sem isso, com 6/pág. só 4 cabiam antes de "estourar" a
    página e empurrar o resto pra folhas extras. Por isso o shell tem
    o tamanho JÁ reduzido (é o que reserva espaço na grade) e quem
    escala é o filho .cartaz-scaler, com o cartaz original por dentro.
  */
  .cartaz-shell {
    width: ${(CARTAZ_LARGURA_MM * escala).toFixed(2)}mm;
    height: ${(CARTAZ_ALTURA_MM * escala).toFixed(2)}mm;
    overflow: hidden;
    flex-shrink: 0;
  }
  .cartaz-scaler {
    width: ${CARTAZ_LARGURA_MM}mm;
    height: ${CARTAZ_ALTURA_MM}mm;
    transform: scale(${escala.toFixed(4)});
    transform-origin: top left;
  }
  .cartaz-scaler .cartaz { height: 100%; }`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${paginaCss}
  * {
    box-sizing: border-box;
    /* sem isso, o navegador some com as cores de fundo ao imprimir
       (economia de tinta por padrão) — o vermelho/amarelo/navy some
       e o texto branco fica ilegível em cima do branco da página. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; }
  .cartaz {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    overflow: hidden;
  }
  .faixa-oferta { background: #FFE600; text-align: center; padding: 18px 0; }
  .oferta-texto {
    display: inline-block; background: #fff; color: #E81820; font-weight: 900;
    font-size: 54px; padding: 4px 32px; border-radius: 10px; letter-spacing: 1px;
  }
  .corpo { text-align: center; padding: 22px 16px 10px; }
  .nome-produto { color: #003068; font-weight: 800; font-size: 31px; line-height: 1.2; text-transform: uppercase; }
  .codigo { font-size: 17px; font-weight: 600; text-transform: none; }
  .variantes { color: #003068; font-weight: 700; font-size: 17px; margin-top: 8px; letter-spacing: 0.5px; }
  .faixa-preco { background: #E81820; color: #fff; text-align: center; padding: 16px 16px 26px; position: relative; }
  .desconto-badge {
    position: absolute; left: 18px; top: 14px; background: #FFE600; color: #E81820;
    font-weight: 900; font-size: 16px; padding: 6px 12px; border-radius: 20px; transform: rotate(-6deg);
  }
  .kit-titulo {
    font-size: 30px; font-weight: 900; line-height: 1.15; margin-bottom: 8px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.25);
  }
  .preco-de { font-size: 16px; font-weight: 700; opacity: 0.85; margin-bottom: 2px; }
  .preco-de-valor { text-decoration: line-through; }
  .preco-linha { display: flex; align-items: baseline; justify-content: center; gap: 8px; }
  .preco-por-label { font-size: 22px; font-weight: 800; }
  .preco { font-weight: 900; font-size: 60px; }
  .cada { position: absolute; right: 26px; bottom: 18px; font-style: italic; font-size: 17px; font-weight: 700; }
  .rodape-info {
    background: #fff; display: flex; align-items: center; justify-content: space-between;
    padding: 18px 18px; gap: 14px;
  }
  .rodape-textos { flex: 1; text-align: left; }
  .validade, .disclaimer { color: #003068; font-weight: 700; font-size: 12px; margin: 2px 0; }
  .mascote { height: 92px; width: auto; flex-shrink: 0; display: block; }
  .marca { background: #003068; text-align: center; padding: 6px 16px 8px; }
  .marca-nome { color: #fff; font-size: 15px; font-weight: 800; }
  .marca-tagline { color: #cfe0f2; font-size: 10px; margin-top: 2px; }
</style>
</head>
<body>
${corpoHtml}
</body>
</html>`;
}

// Agrupa os cartazes em páginas de N (o preset de colunas/linhas de
// PRESET_GRADE). O tamanho reduzido de cada cartaz vem das classes
// .cartaz-shell/.cartaz-scaler (definidas em gerarHtmlCartazes, que já
// calcula a escala) — aqui só monta a marcação.
function gerarPaginasMultiplas(cartazesHtml: string[], cartazesPorPagina: CartazesPorPagina): string {
  const paginas: string[] = [];
  for (let inicio = 0; inicio < cartazesHtml.length; inicio += cartazesPorPagina) {
    const doLote = cartazesHtml.slice(inicio, inicio + cartazesPorPagina);
    const celulas = doLote
      .map((html) => `<div class="celula-grade"><div class="cartaz-shell"><div class="cartaz-scaler">${html}</div></div></div>`)
      .join('\n');
    paginas.push(`<div class="pagina-grade">${celulas}</div>`);
  }
  return paginas.join('\n');
}
