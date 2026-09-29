// Chave de equivalência entre marcas (fase 2 de equivalentes, 29/09/2026).
//
// Dois cadastros com a MESMA chave são o mesmo medicamento na mesma
// apresentação, de laboratórios diferentes (Novalgina 1G 10CP = Dipirona
// EMS 1G 10CP = Maxalgina 1G 10CP). Chave:
//
//   principio_ativo | concentração | forma | modificadores | quantidade
//   ex.: "DIPIRONA|1G|CP||10", "DIPIRONA|500MG/ML|GTS||20ML"
//
// Princípio ativo vem da Trier (nomePrincipioAtivo); o resto é lido do
// NOME, porque a Trier não manda dosagem/forma/embalagem em campo
// separado. Sem princípio ativo OU sem conseguir ler forma e quantidade,
// a chave é null — de propósito: sem chave o produto só agrupa por nome
// idêntico (fase 1), nunca por palpite. Sem a dose no nome, a chave sai
// com a concentração vazia (ver chaveEquivalencia abaixo). Validado em
// 29/09/2026 contra os 5.967 medicamentos ativos da Trier.
//
// Modificadores (MODS) entram na chave porque mudam o produto: liberação
// prolongada, efervescente, mastigável, dispersível, infantil etc. não
// são equivalentes ao comprimido/solução comum. Sabor, "REV", "GEL MOLE"
// e afins ficam de fora (não mudam o medicamento).
//
// Usado por backfill_periodo.js (require) e COPIADO no nó "Mapear
// produtos (lotes de 500)" de sgf-produto-diario.n8n.json (Code node do
// n8n não importa arquivo) — mudar aqui exige mudar lá. Testes:
// node coletor/testar_chave_equivalencia.js
'use strict';

const NUM = '\\d+(?:[.,]\\d+)*';
const SEM_LETRA_ANTES = '(?<![A-Z])'; // "30CP": não há \b entre dígito e letra
const forma = (alternativas) => new RegExp(`${SEM_LETRA_ANTES}(${alternativas})(?![A-Z])`);

// Sinônimos -> código canônico. A ORDEM importa: a primeira que casar
// vence ("500MG ENV 10CP" é comprimido em envelope, não sachê — por isso
// SAC/ENV/PO fica por último).
const FORMAS = [
  [forma('CP|CPR|COMP|DRG|DG|TABS'), 'CP'],
  [forma('CAP|CAPS|CPS|CAPSULA'), 'CAP'],
  [forma('GTS|GOTAS'), 'GTS'],
  [forma('XPE|XAROPE'), 'XPE'],
  // injetável antes de suspensão/solução: "SUS INJ AMP" (Duoflam) e "AMP
  // INJ" (Diprospan) são a mesma suspensão injetável (29/09/2026)
  [forma('AMP|INJ|FA'), 'INJ'],
  [forma('SUSP|SUS'), 'SUSP'],
  [forma('SOL|LIQ'), 'SOL'],
  [forma('SPR|SPRAY|AER|JAT'), 'SPR'],
  [forma('POM'), 'POM'],
  [forma('CR|CREME'), 'CR'],
  [forma('GEL'), 'GEL'],
  [forma('SUP|SUPOS'), 'SUP'],
  [forma('PAST'), 'PAST'],
  [forma('COL|COLIRIO'), 'COL'],
  [forma('SAC|SACHE|PO|ENV'), 'SAC'],
];

const MODS = [
  [forma('L\\.?P|XR|AP|RETARD|L\\.?R|L\\.?C|ER|SR|OD|UD'), 'LIB'],
  [forma('MAST'), 'MAST'],
  [forma('EFERV|EFEV|EFER|EFV'), 'EFERV'],
  [forma('DISP|DISPERS'), 'DISP'],
  [forma('SUBL'), 'SUBL'],
  [forma('ODT|ORODISP'), 'ODT'],
  [forma('PED|INF|INFANTIL'), 'PED'],
  [forma('AD|ADULTO'), 'AD'],
  [forma('NAS'), 'NAS'],
  [forma('OFT'), 'OFT'],
  [forma('VAG'), 'VAG'],
  [forma('DERM'), 'DERM'],
];

const RE_CONCENTRACAO = new RegExp(
  `(${NUM}(?:\\s*(?:MG|MCG|G|UI|%))?(?:\\s*\\+\\s*${NUM})*)\\s*(MG|MCG|G|UI|%)(?:\\s*\\/\\s*(${NUM})?\\s*(ML|G|GTS|DOSE|5))?`
);
const RE_QTD_UNIDADES = /(?<![\d.,])(\d+)\s*(CP|CPR|COMP|CAP|CAPS|CPS|SAC|ENV|AMP|SUP|PAST|DRG|UN|FLAC|TABS)(?![A-Z])/;
const RE_VOLUME = new RegExp(`(${NUM})\\s*(ML|G)(?![A-Z])(?!\\s*\\/)`, 'g');

// "3.300" = três mil e trezentos (ponto de milhar: exatamente 3 dígitos
// depois); "0,15" e "2.5" = decimal.
function numero(texto) {
  const t = /^\d{1,3}(\.\d{3})+$/.test(texto) ? texto.replace(/\./g, '') : texto.replace(',', '.');
  return String(Number(t));
}

function normalizarPrincipioAtivo(valor) {
  const texto = valor == null ? '' : String(valor).trim().toUpperCase().replace(/\s+/g, ' ');
  return texto || null;
}

function lerApresentacao(nomeProduto) {
  const nome = String(nomeProduto || '').toUpperCase().replace(/\s+/g, ' ').trim();

  const c = nome.match(RE_CONCENTRACAO);
  let concentracao = null;
  if (c) {
    const partes = c[1]
      .replace(/\s/g, '')
      .split('+')
      .map((p) => numero(p.replace(/(MG|MCG|G|UI|%)$/, '')));
    concentracao = partes.join('+') + c[2] + (c[4] ? `/${c[3] ? numero(c[3]) : ''}${c[4]}` : '');
  }

  const formaEncontrada = FORMAS.find(([re]) => re.test(nome));
  const modificadores = MODS.filter(([re]) => re.test(nome))
    .map(([, m]) => m)
    .sort()
    .join('.');

  let quantidade = null;
  const u = nome.match(RE_QTD_UNIDADES);
  if (u) {
    quantidade = u[1];
  } else {
    const volumes = [...nome.matchAll(RE_VOLUME)];
    const ultimo = volumes[volumes.length - 1];
    // não confundir com a própria concentração ("1G" de "DIPIRONA 1G")
    if (ultimo && !(c && ultimo.index === c.index)) quantidade = numero(ultimo[1]) + ultimo[2];
    // ...a não ser que seja o ÚNICO número em gramas, sem "/": em pomada/
    // creme ("BETRICORT CR DERM 30G") isso é o tamanho do tubo, não dose.
    else if (ultimo && c && ultimo.index === c.index && c[2] === 'G' && !c[4] && !c[1].includes('+')) {
      quantidade = numero(ultimo[1]) + ultimo[2];
      concentracao = null;
    }
  }

  return { concentracao, forma: formaEncontrada ? formaEncontrada[1] : null, modificadores, quantidade };
}

// Sem a dose no nome (29/09/2026, pedido do gestor): a chave sai com a
// concentração VAZIA — "BETRICORT CR DERM 30G" = "BETACORTAZOL CR DERM
// 30G" (mesma composição completa, forma e tamanho). Só agrupa com quem
// também não tem dose no nome: "DIPIRONA GTS 20ML" nunca cai junto com
// "DIPIRONA 500MG/ML GTS 20ML". Medido no catálogo: 128 grupos novos,
// quase todos marcas da mesma combinação (Torsilax/Trilax, Dorflex/
// Doricin, Buscopan Composto/Escopen, Combigan/Britens).
function chaveEquivalencia(nomeProduto, principioAtivo) {
  const pa = normalizarPrincipioAtivo(principioAtivo);
  if (!pa) return null;
  const a = lerApresentacao(nomeProduto);
  if (!a.forma || !a.quantidade) return null;
  if (a.concentracao) return [pa, a.concentracao, a.forma, a.modificadores, a.quantidade].join('|');
  // Sem dose legível, número solto no nome costuma ser a dose sem unidade
  // ("CITONEURIN TABS 5000" x "CITOBE") — entra na chave pra não juntar
  // doses diferentes. Os números da quantidade/volume não contam.
  const nome = String(nomeProduto || '').toUpperCase();
  const numerosQtd = new Set((a.quantidade.match(/\d+(?:[.,]\d+)*/g) || []).map(numero));
  const soltos = (nome.match(/\d+(?:[.,]\d+)*/g) || []).map(numero).filter((n) => !numerosQtd.has(n));
  const mods = [a.modificadores, ...soltos.map((n) => `N${n}`)].filter(Boolean).join('.');
  return [pa, '', a.forma, mods, a.quantidade].join('|');
}

module.exports = { chaveEquivalencia, lerApresentacao, normalizarPrincipioAtivo };
