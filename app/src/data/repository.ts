import {
  AtividadeChecklist,
  ChecklistItemStatus,
  ClienteInatividade,
  DesempenhoVendedorDiario,
  MetaVendedor,
  MetricasVendedorDiario,
  Profile,
  ProdutoPromocaoAlerta,
  RankingVendedorDia,
  SalvarMetaInput,
  StatusSincronizacao,
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

  // Checklist diário: `getAtividadesChecklist` traz só as ativas para
  // vendedor, e todas (incl. inativas) para gestor gerenciar.
  getAtividadesChecklist(profile: Profile): Promise<AtividadeChecklist[]>;
  salvarAtividadeChecklist(input: { id?: string; titulo: string }): Promise<void>;
  alternarAtividadeChecklist(id: string, ativo: boolean): Promise<void>;
  getChecklistHoje(profile: Profile): Promise<ChecklistItemStatus[]>;
  marcarChecklistItem(profile: Profile, atividadeId: string, concluida: boolean): Promise<void>;

  // Não vem da API SGF — é o coletor que escreve isso a cada rodada de
  // sync (ver supabase/schema.sql, tabela sync_control). Sem filtro por
  // papel: não é dado sensível, qualquer autenticado pode ler.
  getStatusSincronizacao(): Promise<StatusSincronizacao[]>;
}
