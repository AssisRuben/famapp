// Grupos curados usados nos filtros de "Meus clientes" e "Cliente para
// resgate" — produto_catalogo.grupo tem ~25 valores reais da Trier, a
// maioria irrelevante pra resgate (CHOCOLATE, REFRIGERANTES,
// BONIFICACAO...). Fica só o que interessa, mesclando as variantes
// (GENERICO/GENERICO ANTIMICROBIANOS/GENERICO CONTROLADOS/GENERICO
// ONEROSO viram um "Genérico" só, mesma lógica pra Similar/Ético;
// FRALDAS e PRODUTOS INFANTIS viram um filtro só).
export interface GrupoFiltro {
  chave: string;
  label: string;
  bate: (grupo: string | null) => boolean;
}

export const GRUPOS_FILTRO: GrupoFiltro[] = [
  { chave: 'generico', label: 'Genérico', bate: (g) => !!g && g.trim().toUpperCase().startsWith('GENERICO') },
  { chave: 'similar', label: 'Similar', bate: (g) => !!g && g.trim().toUpperCase().startsWith('SIMILAR') },
  { chave: 'etico', label: 'Ético', bate: (g) => !!g && g.trim().toUpperCase().startsWith('ETICO') },
  {
    chave: 'fralda_infantil',
    label: 'Fraldas / Infantil',
    bate: (g) => !!g && ['FRALDAS', 'PRODUTOS INFANTIS'].includes(g.trim().toUpperCase()),
  },
  { chave: 'orelhinha', label: 'Orelhinha', bate: (g) => !!g && g.trim().toUpperCase() === 'ORELHINHA' },
];
