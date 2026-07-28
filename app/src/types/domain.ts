export type Role = 'vendedor' | 'gestor';

export interface Profile {
  id: string;
  nome: string;
  email: string;
  role: Role;
  codigoVendedor: number | null;
}

// Espelha sync_control — controle de última sincronização do coletor
// com a API SGF. NÃO vem da API (a API não informa quando os dados
// foram puxados); é escrito pelo próprio coletor a cada rodada.
export interface StatusSincronizacao {
  entityName: string;
  ultimaSincronizacao: string | null;
}

// Espelha vw_desempenho_vendedor_diario
export interface DesempenhoVendedorDiario {
  dataEmissao: string;
  codigoVendedor: number;
  nomeVendedor: string;
  quantidadeAtendimentos: number;
  quantidadeItens: number;
  itensPorAtendimento: number;
}

// Espelha vw_metricas_vendedor_diario
export interface MetricasVendedorDiario {
  dataEmissao: string;
  codigoVendedor: number;
  nomeVendedor: string;
  qtdNotas: number;
  faturamentoLiquido: number;
  faturamentoBruto: number;
  totalDesconto: number;
  taxaDescontoPct: number;
  comissaoEstimada: number;
  ticketMedio: number;
}

// Espelha vw_ranking_vendedores_dia
export interface RankingVendedorDia {
  dataEmissao: string;
  codigoVendedor: number;
  nomeVendedor: string;
  faturamentoLiquido: number;
  posicao: number;
}

// Espelha vw_clientes_inatividade
export interface ClienteInatividade {
  codigo: number;
  nome: string;
  telefone: string | null;
  ultimaCompra: string | null;
  diasSemComprar: number | null;
  inativo: boolean;
}

export type TipoReceita = 'comum' | 'controle_especial' | 'antimicrobiano';

export interface Produto {
  codigo: number;
  nome: string;
  precoAtual: number;
  precoAnterior: number | null;
  emPromocao: boolean;
  percentualDesconto: number | null;
  exigeReceita: boolean;
  tipoReceita: TipoReceita | null;
}

export interface ClienteCompradorPromocao {
  codigoCliente: number;
  nomeCliente: string;
  telefone: string | null;
  ultimaCompraProduto: string;
  quantidade: number;
}

export interface ProdutoPromocaoAlerta {
  produto: Produto;
  clientes: ClienteCompradorPromocao[];
}

export interface VendaReceitaPendente {
  itemId: string;
  dataVenda: string;
  codigoProduto: number;
  nomeProduto: string;
  tipoReceita: TipoReceita;
  codigoCliente: number | null;
  nomeCliente: string;
  codigoVendedor: number;
  nomeVendedor: string;
  receitaAnexada: boolean;
  receitaDataAnexo: string | null;
  receitaFotoUri: string | null;
}

// ============================================================
// METAS — mensal + 4 buckets semanais fixos (1–7, 8–14, 15–21,
// 22–fim do mês).
// ============================================================
export interface MetaSemana {
  semana: 1 | 2 | 3 | 4;
  rotulo: string;
  valorMeta: number;
  valorRealizado: number;
}

export interface MetaVendedor {
  codigoVendedor: number;
  nomeVendedor: string;
  ano: number;
  mes: number;
  valorMetaMensal: number;
  valorRealizadoMensal: number;
  semanas: MetaSemana[];
}

export interface SalvarMetaInput {
  codigoVendedor: number;
  ano: number;
  mes: number;
  valorMetaMensal: number;
  valoresMetaSemanal: [number, number, number, number];
}

// ============================================================
// CHECKLIST DIÁRIO — atividades cadastradas pelo gestor, marcadas
// pelo vendedor todo dia.
// ============================================================
export interface AtividadeChecklist {
  id: string;
  titulo: string;
  ativo: boolean;
}

export interface ChecklistItemStatus {
  atividade: AtividadeChecklist;
  concluida: boolean;
}
