import {
  AtividadeChecklist,
  Campanha,
  ChecklistItemStatus,
  ClienteInatividade,
  ComissaoMensal,
  DesempenhoVendedorDiario,
  FaixaComissao,
  ItemPrecificacao,
  MetaVendedor,
  MetricasVendedorDiario,
  ParametrosCompra,
  Profile,
  ProdutoCatalogo,
  ProdutoElegibilidade,
  ProdutoPromocaoAlerta,
  RankingVendedorDia,
  SalvarCampanhaInput,
  SalvarMetaInput,
  StatusSincronizacao,
  SugestaoCampanhaParams,
  SugestaoCompra,
  TipoReceita,
  VendaReceitaPendente,
} from '../types/domain';

/**
 * Contrato de acesso a dados do app. A implementação mock replica o
 * comportamento das views + RLS definidas em supabase/schema.sql e
 * supabase/rls_policies.sql (ex.: vendedor só enxerga as próprias vendas,
 * gestor enxerga tudo, clientes é visível para qualquer autenticado).
 *
 * Quando a Frente 2 (integração real) estiver pronta, basta criar
 * SupabaseRepository implementando esta mesma interface e trocar o
 * export em src/data/index.ts — nenhuma tela precisa mudar.
 */
export interface DataRepository {
  login(email: string, senha: string): Promise<Profile>;
  logout(): Promise<void>;
  getSession(): Promise<Profile | null>;

  getDesempenhoVendedorDiario(profile: Profile, dataEmissao: string): Promise<DesempenhoVendedorDiario[]>;
  getMetricasVendedorDiario(profile: Profile, dataEmissao: string): Promise<MetricasVendedorDiario[]>;
  getRankingVendedoresDia(profile: Profile, dataEmissao: string): Promise<RankingVendedorDia[]>;
  getClientesInatividade(profile: Profile): Promise<ClienteInatividade[]>;

  // Alertas de promoção: intencionalmente NÃO filtrado por vendedor — é
  // uma lista de oportunidades de contato, útil pra qualquer atendente.
  // No backend real isso precisará de uma view/RPC própria (security
  // definer) já que a RLS de `vendas`/`clientes` é por vendedor.
  getProdutosEmPromocao(profile: Profile): Promise<ProdutoPromocaoAlerta[]>;

  // Fila de receitas: aqui sim segue a mesma regra de vendedor-vê-só-o-seu.
  getVendasComReceita(profile: Profile): Promise<VendaReceitaPendente[]>;
  anexarReceita(itemId: string, info: { tipo: TipoReceita; fotoUri: string | null }): Promise<void>;

  // Metas: vendedor só as próprias, gestor todas. `salvarMeta` é usado
  // pela tela de administração (gestor-only na UI).
  getMetas(profile: Profile, ano: number, mes: number): Promise<MetaVendedor[]>;
  salvarMeta(input: SalvarMetaInput): Promise<void>;

  // Comissão: só fechamento MENSAL (semana/dia não geram comissão própria
  // — ver vw_metas_comissao). Vendedor só a própria linha, gestor todas.
  // Faixas hoje são só leitura no app (tabela `faixas_comissao` já é
  // editável no banco, mas ainda sem tela de edição — ajuste é via SQL).
  getComissoesMensal(profile: Profile, ano: number, mes: number): Promise<ComissaoMensal[]>;
  getFaixasComissao(): Promise<FaixaComissao[]>;

  // Checklist diário: `getAtividadesChecklist` traz só as ativas para
  // vendedor, e todas (incl. inativas) para gestor gerenciar.
  getAtividadesChecklist(profile: Profile): Promise<AtividadeChecklist[]>;
  salvarAtividadeChecklist(input: { id?: string; titulo: string; horario: string | null }): Promise<void>;
  alternarAtividadeChecklist(id: string, ativo: boolean): Promise<void>;
  getChecklistHoje(profile: Profile): Promise<ChecklistItemStatus[]>;
  marcarChecklistItem(profile: Profile, atividadeId: string, concluida: boolean): Promise<void>;

  // Não vem da API SGF — é o coletor que escreve isso a cada rodada de
  // sync (ver supabase/schema.sql, tabela sync_control). Sem filtro por
  // papel: não é dado sensível, qualquer autenticado pode ler.
  getStatusSincronizacao(): Promise<StatusSincronizacao[]>;

  // Campanhas/Cartazetes — gestor-only na UI. `produto_catalogo` no
  // real seria sincronizado do ProdutoIntegracaoDto (Trier); não tem
  // API de escrita pra desconto/campanha, então "campanha" é uma
  // entidade nossa (não existe no Trier).
  getCatalogoProdutos(profile: Profile): Promise<ProdutoCatalogo[]>;
  sugerirProdutosCampanha(profile: Profile, params: SugestaoCampanhaParams): Promise<ProdutoElegibilidade[]>;
  getCampanhas(profile: Profile): Promise<Campanha[]>;
  salvarCampanha(input: SalvarCampanhaInput): Promise<Campanha>;
  excluirCampanha(id: string): Promise<void>;

  // Compras (Dose Certa) — gestor-only na UI. Fornecedor sugerido e
  // fator de compra vêm da compra mais recente de cada produto
  // (vw_produto_fornecedor_recente no real), não de cadastro manual.
  gerarSugestaoCompras(profile: Profile, params: ParametrosCompra): Promise<SugestaoCompra[]>;

  // Precificação — gestor-only na UI. Diagnóstico (quem merece atenção
  // e por quê), diferente de Campanhas (decide quanto descontar).
  getRelatorioPrecificacao(profile: Profile): Promise<ItemPrecificacao[]>;
}
