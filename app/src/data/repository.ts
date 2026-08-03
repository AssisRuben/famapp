import {
  AtividadeChecklist,
  Campanha,
  ChecklistItemStatus,
  ClienteDoVendedor,
  ClienteInatividade,
  ComissaoMensal,
  ContatoCliente,
  DesempenhoVendedorDiario,
  DesempenhoVendedorMensal,
  DesempenhoVendedorSemanal,
  FaixaComissao,
  HistoricoCompraCliente,
  ItemPrecificacao,
  MetaVendedor,
  MetricasVendedorDiario,
  MetricasVendedorMensal,
  MetricasVendedorSemanal,
  ParametrosCompra,
  Profile,
  ProdutoCatalogo,
  ProdutoElegibilidade,
  ProdutoPromocaoAlerta,
  ProdutoRecorrenteCliente,
  RankingVendedorDia,
  RegistrarContatoInput,
  ResumoClientesInatividade,
  SalvarCampanhaInput,
  SalvarMetaInput,
  StatusSincronizacao,
  IdentificacaoCompradorVendedor,
  SugestaoCampanhaParams,
  SugestaoCompra,
  TipoReceita,
  VendaAntimicrobianoRecente,
  VendaReceitaPendente,
  VendaSemIdentificacaoComprador,
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
  // Mesmas métricas, agregadas pro mês inteiro — usadas pelo card
  // "Desempenho do mês" do Painel.
  getDesempenhoVendedorMensal(profile: Profile, ano: number, mes: number): Promise<DesempenhoVendedorMensal[]>;
  getMetricasVendedorMensal(profile: Profile, ano: number, mes: number): Promise<MetricasVendedorMensal[]>;
  // Mesmas métricas, agregadas por bucket de semana fixo (1-7, 8-14,
  // 15-21, 22-fim do mês) — usadas pelo toggle Dia/Semana/Mês do card
  // "Desempenho" do Painel.
  getDesempenhoVendedorSemanal(profile: Profile, ano: number, mes: number, semana: 1 | 2 | 3 | 4): Promise<DesempenhoVendedorSemanal[]>;
  getMetricasVendedorSemanal(profile: Profile, ano: number, mes: number, semana: 1 | 2 | 3 | 4): Promise<MetricasVendedorSemanal[]>;
  getRankingVendedoresDia(profile: Profile, dataEmissao: string): Promise<RankingVendedorDia[]>;
  getClientesInatividade(profile: Profile): Promise<ClienteInatividade[]>;
  // Tela "Meus clientes" — clientes distintos que o vendedor logado já
  // atendeu, com busca por nome feita no app (lista pequena por
  // vendedor, não precisa de busca no banco). Gestor (sem
  // codigoVendedor) recebe lista vazia — tela é por vendedor mesmo.
  getClientesDoVendedor(profile: Profile): Promise<ClienteDoVendedor[]>;
  // Histórico de compra do cliente (qualquer vendedor), mostrado ao
  // expandir um cliente na tela "Meus clientes" (limite padrão 5) e na
  // tela "Cliente para resgate" (limite 7, com nome do vendedor por
  // linha).
  getHistoricoComprasCliente(profile: Profile, codigoCliente: number, limite?: number): Promise<HistoricoCompraCliente[]>;
  // Base dos filtros de resgate ("Uso contínuo" + categoria/produto)
  // da tela "Meus clientes" — 1 linha por (cliente, produto), só das
  // vendas do vendedor logado.
  getProdutosRecorrentesDoVendedor(profile: Profile): Promise<ProdutoRecorrenteCliente[]>;
  // Mesma base, mas agregada por cliente somando QUALQUER vendedor —
  // usada pelos mesmos filtros na tela "Cliente para resgate", que
  // mostra todo cliente pra qualquer vendedor agir (não só o próprio).
  getProdutosRecorrentesClientes(profile: Profile): Promise<ProdutoRecorrenteCliente[]>;
  // Contagem agregada (total/inativos) pro tile do Painel — não sofre
  // do limite padrão de 1000 linhas por request que getClientesInatividade
  // tem quando usado só pra contar.
  getResumoClientesInatividade(profile: Profile): Promise<ResumoClientesInatividade>;

  // Alertas de promoção: intencionalmente NÃO filtrado por vendedor — é
  // uma lista de oportunidades de contato, útil pra qualquer atendente.
  // No backend real isso precisará de uma view/RPC própria (security
  // definer) já que a RLS de `vendas`/`clientes` é por vendedor.
  getProdutosEmPromocao(profile: Profile): Promise<ProdutoPromocaoAlerta[]>;

  // Fila de receitas: aqui sim segue a mesma regra de vendedor-vê-só-o-seu.
  getVendasComReceita(profile: Profile): Promise<VendaReceitaPendente[]>;
  anexarReceita(itemId: string, info: { tipo: TipoReceita; fotoUri: string | null }): Promise<void>;

  // Card "Antibiótico vendido" em Alertas: assim como getProdutosEmPromocao,
  // intencionalmente NÃO filtrado por vendedor — é oportunidade de
  // contato (acompanhamento pós-venda), não fila pessoal.
  getVendasAntimicrobianoRecente(profile: Profile): Promise<VendaAntimicrobianoRecente[]>;

  // Compliance: % de venda de controlado sem identificação real do
  // comprador, por vendedor — card "Venda controlada sem comprador" em Alertas.
  // Gestor vê todos, vendedor só a própria linha (dado sensível, ao
  // contrário do resto do app — ver comentário na view).
  getIdentificacaoCompradorPorVendedor(profile: Profile): Promise<IdentificacaoCompradorVendedor[]>;
  // Drill-down: as vendas específicas por trás do número de um vendedor.
  getVendasSemIdentificacaoComprador(
    profile: Profile,
    codigoVendedor: number
  ): Promise<VendaSemIdentificacaoComprador[]>;

  // Contatos (ligação/WhatsApp) — usado pra suprimir das listas de
  // resgate/aniversário/uso contínuo/alto valor sumindo/promoção quem
  // já foi contatado há pouco tempo pelo mesmo motivo (ver
  // lib/contatos.ts pra janela de supressão de cada motivo).
  // getContatosRecentes traz os últimos ~300 dias (cobre a maior
  // janela, de aniversário); cada tela filtra pela janela do seu
  // motivo específico.
  getContatosRecentes(profile: Profile): Promise<ContatoCliente[]>;
  registrarContato(input: RegistrarContatoInput): Promise<void>;

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
