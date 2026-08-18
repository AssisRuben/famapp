import { KitPromocao } from '../types/domain';

// Presets comuns (18/08/2026, espelhando exemplos reais passados pelo
// usuário: "compre 3 pague 2", "50% no 2º item", "25% no 2º item") —
// a tela ainda permite digitar outro valor além desses.
export const PRESETS_KIT: { label: string; kit: KitPromocao }[] = [
  { label: 'Compre 3, pague 2', kit: { quantidadeMinima: 3, percentualDescontoItem: 100 } },
  { label: '50% no 2º item', kit: { quantidadeMinima: 2, percentualDescontoItem: 50 } },
  { label: '25% no 2º item', kit: { quantidadeMinima: 2, percentualDescontoItem: 25 } },
];

// Texto curto pro cartaz/lista de produtos.
export function descricaoKit(kit: KitPromocao): string {
  if (kit.percentualDescontoItem >= 100) {
    return `Compre ${kit.quantidadeMinima}, pague ${kit.quantidadeMinima - 1}`;
  }
  return `Leve ${kit.quantidadeMinima}, ${kit.percentualDescontoItem}% OFF no ${kit.quantidadeMinima}º item`;
}
