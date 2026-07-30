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
  // Custo de aquisição total (venda_itens.vlr_custo_produto) — margem
  // bruta = faturamentoLiquido - totalCusto.
  totalCusto: number;
  margemBrutaPct: number;
}

// Espelha vw_ranking_vendedores_dia
export interface RankingVendedorDia {
  dataEmissao: string;
  codigoVendedor: number;
  nomeVendedor: string;
  faturamentoLiquido: number;
  posicao: number;
}

// Espelha vw_clientes_inatividade. codigoVendedor/nomeVendedor são do
// vendedor da ÚLTIMA compra do cliente — é o que define "cliente do
// vendedor" pra filtro da aba Clientes (vendedor só vê os seus,
// gestor vê todos).
export interface ClienteInatividade {
  codigo: number;
  nome: string;
  telefone: string | null;
  ultimaCompra: string | null;
  diasSemComprar: number | null;
  inativo: boolean;
  codigoVendedor: number | null;
  nomeVendedor: string | null;
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
// COMISSÃO — régua sobre margem bruta pelo percentual da meta MENSAL
// atingido (não se aplica a semana nem a dia). Espelha
// vw_metas_comissao/faixas_comissao no Supabase real.
// ============================================================
export interface FaixaComissao {
  percentualMetaMin: number;
  percentualComissao: number;
}

export interface ComissaoMensal {
  codigoVendedor: number;
  nomeVendedor: string;
  ano: number;
  mes: number;
  valorMeta: number;
  valorRealizado: number;
  percentualAtingido: number;
  margemBrutaValor: number;
  percentualComissao: number;
  comissaoValor: number;
}

// ============================================================
// CHECKLIST DIÁRIO — atividades cadastradas pelo gestor, marcadas
// pelo vendedor todo dia. `horario` (HH:mm) dispara um lembrete
// push de segunda a sábado nesse horário.
// ============================================================
export interface AtividadeChecklist {
  id: string;
  titulo: string;
  horario: string | null;
  ativo: boolean;
}

export interface ChecklistItemStatus {
  atividade: AtividadeChecklist;
  concluida: boolean;
}

// ============================================================
// CAMPANHAS / CARTAZETES
//
// O Trier NÃO tem endpoint de escrita pra desconto/campanha — só
// leitura (obter-todos/obter-alterados/obter-movimentados, igual
// venda/cliente). Quem decide preço de encarte é a rede, digitado
// direto no Trier. O que este módulo resolve é a decisão que a
// farmácia NÃO faz em lugar nenhum hoje: promoção avulsa baseada em
// margem/estoque/venda. Por isso "campanha" aqui é uma entidade
// NOSSA (Supabase), não um espelho de algo do Trier — e o preço só
// vale de verdade no caixa depois que o .txt gerado é importado
// manualmente no Trier (não existe API pra isso).
// ============================================================

// Espelha produto_catalogo — futuramente sincronizado do
// ProdutoIntegracaoDto real (Trier); por ora, mock.
export interface ProdutoCatalogo {
  codigo: number;
  codigoBarras: string;
  nome: string;
  categoria: string;
  marca: string;
  precoVenda: number;
  custoMedio: number;
  estoqueAtual: number;
}

export interface ProdutoElegibilidade {
  produto: ProdutoCatalogo;
  margemAtualPct: number;
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
  percentualDescontoSugerido: number;
  precoSugerido: number;
  margemResultantePct: number;
}

export interface SugestaoCampanhaParams {
  margemMinimaPct: number;
  descontoAlvoPct: number;
  quantidadeMaxima: number;
}

export interface CampanhaProduto {
  codigoProduto: number;
  codigoBarras: string;
  nomeProduto: string;
  precoRegular: number;
  precoPromocional: number;
  percentualDesconto: number;
  quantidadeCartazes: number;
  // Validade por item — começa igual à da campanha, mas é editável
  // por produto na tela de Cartazetes (ex.: estender a validade de um
  // item específico). É só pra impressão/txt desse momento — não é
  // persistido de volta em `campanha_produtos` no Supabase real.
  dataInicio: string;
  dataFim: string;
}

export interface Campanha {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  criadaEm: string;
  produtos: CampanhaProduto[];
}

export interface SalvarCampanhaInput {
  id?: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  produtos: CampanhaProduto[];
}

// Um cartaz por grupo (mesmo nome-base + preço + validade) — o
// mesmo produto em tamanhos/variações diferentes vira UM cartaz
// listando as variantes, não um cartaz por código de barras.
export interface GrupoCartazete {
  chave: string;
  nomeBase: string;
  variantes: string[];
  precoPromocional: number;
  percentualDesconto: number;
  dataInicio: string;
  dataFim: string;
  quantidadeCartazes: number;
  produtos: CampanhaProduto[];
}

// ============================================================
// COMPRAS (Dose Certa) — lista de compras sugerida por
// demanda/estoque. Estratégia "estoque de segurança": calcula a
// demanda média diária a partir da venda recente (mesma janela usada
// em Campanhas) e sugere repor até um alvo de dias de cobertura.
// Fornecedor sugerido e fator de compra (conversão de embalagem) vêm
// da compra mais recente do produto (vw_produto_fornecedor_recente) —
// a API da Trier não expõe um cadastro de "fornecedor preferido por
// produto" à parte. Prazo de entrega e última cotação (que existem na
// tela do Dose Certa dentro do Trier) NÃO têm endpoint de leitura —
// por isso não aparecem aqui.
// ============================================================
export interface ParametrosCompra {
  diasSeguranca: number;
  diasCobertura: number;
  // Janela de venda usada pra calcular a demanda média diária (padrão
  // 30 — mesmo recorte histórico de Campanhas/Precificação). No mock,
  // o total vendido (quantidadeVendida30d) continua fixo em 30 dias —
  // só o divisor muda, então é uma aproximação; no real, viria de uma
  // agregação configurável sobre venda_itens.
  diasBaseVenda: number;
  categoria?: string;
}

// ============================================================
// PRECIFICAÇÃO — sinais que ajudam decisão de preço, calculados a
// partir do que já existe (giro, margem, categoria, campanha ativa).
// "Parado" e "elasticidade" são heurísticas de v1 (ver
// src/lib/precificacao.ts pros limites usados) — margem por categoria
// ao longo do tempo fica de fora por enquanto: precisaria de série
// histórica que hoje não existe (só temos o "hoje").
// ============================================================
export type TagPrecificacao = 'candidato_reajuste' | 'parado_avaliar_preco' | 'baixa_elasticidade' | 'alta_elasticidade';

export interface ItemPrecificacao {
  produto: ProdutoCatalogo;
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
  margemAtualPct: number;
  temDescontoAtivo: boolean;
  tags: TagPrecificacao[];
}

export interface SugestaoCompra {
  codigoProduto: number;
  nomeProduto: string;
  codigoBarras: string;
  categoria: string;
  estoqueAtual: number;
  demandaMediaDiaria: number;
  estoqueMinimo: number;
  estoqueAlvo: number;
  fatorCompra: number;
  custoMedio: number;
  precoVenda: number;
  margemAtualPct: number;
  fornecedorSugerido: string | null;
  quantidadeSugerida: number;
}
