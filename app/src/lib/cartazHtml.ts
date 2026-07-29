import { GrupoCartazete } from '../types/domain';
import { formatBRL } from './format';
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

  return `
    <div class="cartaz">
      <div class="faixa-oferta"><span class="oferta-texto">OFERTA</span></div>
      <div class="corpo">
        <div class="nome-produto">${escapeHtml(grupo.nomeBase)}${codigoHtml}</div>
        ${variantesHtml}
      </div>
      <div class="faixa-preco">
        ${descontoBadgeHtml}
        ${precoDeHtml}
        <div class="preco-linha">
          <span class="preco-por-label">POR</span>
          <span class="preco">${escapeHtml(formatBRL(grupo.precoPromocional))}</span>
        </div>
        <span class="cada">CADA</span>
      </div>
      <div class="rodape-info">
        <div class="rodape-textos">
          <div class="validade">OFERTA VÁLIDA DE ${validade}.</div>
          <div class="disclaimer">SUJEITA A DISPONIBILIDADE DE ESTOQUE.</div>
        </div>
        <img class="mascote" src="${MASCOTE_CONVIVA_BASE64}" alt="" />
      </div>
      <div class="marca">
        <div class="marca-nome">Farmácia Realce Conviva</div>
        <div class="marca-tagline">Perto de você, ao lado da sua saúde.</div>
      </div>
    </div>`;
}

// Gera o HTML completo (1 página por cartaz, repetido conforme a
// quantidade configurada em cada grupo) pronto pra passar pro
// expo-print. Cada grupo já veio agrupado por variante — ver
// src/lib/cartazetes.ts.
export function gerarHtmlCartazes(grupos: GrupoCartazete[]): string {
  const paginas = grupos
    .flatMap((grupo) => Array.from({ length: Math.max(grupo.quantidadeCartazes, 1) }, () => cartazHtml(grupo)))
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A5; margin: 10mm; }
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
    page-break-after: always;
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
${paginas}
</body>
</html>`;
}
