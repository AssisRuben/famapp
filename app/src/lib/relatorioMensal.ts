import { MetricaMensal } from '../types/domain';

// Catálogo das chaves de metricas_mensais que a tela conhece — ver
// migracao_metricas_mensais.sql pra quem escreve essas linhas
// (trigger de produtos_em_falta + workflow n8n de fechamento de mês).
// Métrica nova só precisa entrar aqui, sem migração de schema.

export interface DefinicaoMetricaSimples {
  chave: string;
  titulo: string;
  formato: 'numero' | 'moeda';
}

// Farmácia inteira (codigoVendedor null) — só quantidade, sem quebrar
// por vendedor (pedido explícito do usuário: "só quero a quantidade,
// não quero os produtos").
export const METRICAS_FARMACIA: DefinicaoMetricaSimples[] = [
  { chave: 'produtos_em_falta_reportados', titulo: 'Produtos em falta reportados', formato: 'numero' },
  { chave: 'pendencias_dadas_baixa', titulo: 'Pendências dadas baixa', formato: 'numero' },
];

// Por vendedor, valor único (sem quantidade/valor/margem separados).
export const METRICAS_VENDEDOR_SIMPLES: DefinicaoMetricaSimples[] = [
  { chave: 'carteira_clientes_total', titulo: 'Clientes na carteira', formato: 'numero' },
  { chave: 'whatsapp_enviados', titulo: 'WhatsApp enviados', formato: 'numero' },
  { chave: 'ligacoes_feitas', titulo: 'Ligações feitas', formato: 'numero' },
];

export interface DefinicaoMetricaVenda {
  // Prefixo — as 3 chaves reais são `${chave}_quantidade`, `${chave}_valor`, `${chave}_margem`.
  chave: string;
  titulo: string;
  // Rótulo do número de "quantidade" no singular — a maioria conta
  // unidades vendidas ("venda"/"vendas"), mas cliente_alto_valor_recuperado
  // conta CLIENTES distintos ("cliente"/"clientes"), não vendas — usar
  // sempre "vendas" ali confundia o número com quantidade de notas.
  unidadeQuantidade: string;
}

// Por vendedor, sempre no formato quantidade+valor+margem bruta —
// tudo que tem atividade de venda associada (pedido explícito).
export const METRICAS_VENDEDOR_VENDA: DefinicaoMetricaVenda[] = [
  { chave: 'venda_adicional', titulo: 'Venda adicional', unidadeQuantidade: 'venda' },
  { chave: 'venda_complementar', titulo: 'Venda complementar', unidadeQuantidade: 'venda' },
  { chave: 'venda_campanha', titulo: 'Venda de campanha', unidadeQuantidade: 'venda' },
  { chave: 'cliente_alto_valor_recuperado', titulo: 'Cliente de alto valor recuperado', unidadeQuantidade: 'cliente' },
  { chave: 'produto_promocao', titulo: 'Produto em promoção comercializado', unidadeQuantidade: 'venda' },
  // Atribuída ao DONO da carteira, não a quem bateu a venda (mesmo
  // critério de vw_carteira_clientes) — de propósito NÃO entra na
  // margem_bruta_total_deduplicada (não é ação pontual, é o consumo
  // normal do cliente, ver comentário na função SQL).
  { chave: 'venda_carteira', titulo: 'Vendas para clientes da carteira', unidadeQuantidade: 'venda' },
];

export interface MetricaVenda {
  quantidade: number;
  valor: number;
  margem: number;
}

export function valorMetrica(metricas: MetricaMensal[], codigoVendedor: number | null, chave: string): number {
  return metricas.find((m) => m.codigoVendedor === codigoVendedor && m.chave === chave)?.valor ?? 0;
}

export function metricaVenda(metricas: MetricaMensal[], codigoVendedor: number | null, chaveBase: string): MetricaVenda {
  return {
    quantidade: valorMetrica(metricas, codigoVendedor, `${chaveBase}_quantidade`),
    valor: valorMetrica(metricas, codigoVendedor, `${chaveBase}_valor`),
    margem: valorMetrica(metricas, codigoVendedor, `${chaveBase}_margem`),
  };
}

// % de variação vs mês anterior — null quando não dá pra comparar de
// forma útil (mês anterior zerado: "+infinito%" não ajuda ninguém).
export function deltaPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

// Códigos de vendedor com QUALQUER linha no mês (farmácia fica de
// fora, codigoVendedor null) — usado pra só listar quem teve
// atividade, sem linha em branco poluindo (pedido explícito).
export function codigosVendedorComAtividade(metricas: MetricaMensal[]): Set<number> {
  return new Set(
    metricas
      .filter((m): m is MetricaMensal & { codigoVendedor: number } => m.codigoVendedor != null && m.valor !== 0)
      .map((m) => m.codigoVendedor)
  );
}

// Margem bruta total do vendedor — usado como critério único de
// "destaque do mês" e pra ordenar a lista (quem rendeu mais margem
// primeiro). NÃO soma as categorias de venda na mão (isso contava a
// mesma venda duas vezes quando um produto está cadastrado em mais de
// uma categoria ao mesmo tempo — achado 23/08/2026 com dado real: um
// produto em Venda Adicional E numa campanha de Cartazetes ao mesmo
// tempo dobrava a margem total). Já vem deduplicada por venda_item da
// calcular_metricas_mes (ver migracao_metricas_mensais_calculo_ao_vivo.sql).
export function margemBrutaTotal(metricas: MetricaMensal[], codigoVendedor: number): number {
  return valorMetrica(metricas, codigoVendedor, 'margem_bruta_total_deduplicada');
}
