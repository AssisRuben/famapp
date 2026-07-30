import type { User } from '@supabase/supabase-js';
import { supabase } from './client';
import { DataRepository } from '../repository';
import {
  AtividadeChecklist,
  Campanha,
  ChecklistItemStatus,
  ClienteInatividade,
  ComissaoMensal,
  DesempenhoVendedorDiario,
  FaixaComissao,
  ItemPrecificacao,
  MetaSemana,
  MetaVendedor,
  MetricasVendedorDiario,
  ParametrosCompra,
  Profile,
  ProdutoCatalogo,
  ProdutoElegibilidade,
  ProdutoPromocaoAlerta,
  RankingVendedorDia,
  Role,
  SalvarCampanhaInput,
  SalvarMetaInput,
  StatusSincronizacao,
  SugestaoCampanhaParams,
  SugestaoCompra,
  TipoReceita,
  VendaReceitaPendente,
} from '../../types/domain';
import { calcularSugestaoCompras } from '../../lib/doseCerta';
import { calcularRelatorioPrecificacao } from '../../lib/precificacao';
import { sugerirCandidatos } from '../../lib/campanhas';
import { rotuloSemana } from '../../lib/metas';

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function mapearProdutoCatalogo(r: any): ProdutoCatalogo {
  return {
    codigo: r.codigo,
    codigoBarras: r.codigo_barras ?? '',
    nome: r.nome,
    categoria: r.categoria ?? '',
    marca: r.marca ?? '',
    precoVenda: Number(r.preco_venda),
    custoMedio: Number(r.custo_medio),
    estoqueAtual: r.estoque_atual,
  };
}

// profiles não guarda nome (só id/role/codigo_vendedor) — pro vendedor
// usamos vendedores.nome (já sincronizado pelo coletor); pro gestor,
// que não tem linha em vendedores, cai num rótulo fixo. Se quiser o
// nome de verdade do gestor no futuro, dá pra adicionar uma coluna
// `nome` em profiles — não fiz isso agora pra não pedir mais uma
// migração em cima do que já é bastante coisa nesta rodada.
async function buscarProfile(user: User): Promise<Profile | null> {
  const { data: perfil, error } = await supabase
    .from('profiles')
    .select('id, role, codigo_vendedor')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !perfil) return null;

  if (perfil.codigo_vendedor != null) {
    const { data: vendedor } = await supabase
      .from('vendedores')
      .select('nome')
      .eq('codigo', perfil.codigo_vendedor)
      .maybeSingle();
    return {
      id: perfil.id,
      nome: vendedor?.nome ?? user.email ?? `Vendedor ${perfil.codigo_vendedor}`,
      email: user.email ?? '',
      role: perfil.role as Role,
      codigoVendedor: perfil.codigo_vendedor,
    };
  }

  return {
    id: perfil.id,
    nome: 'Gestor(a) da Farmácia',
    email: user.email ?? '',
    role: perfil.role as Role,
    codigoVendedor: null,
  };
}

/**
 * Frente 2: implementação real do DataRepository, consumindo só o
 * Supabase (nunca a API da Trier diretamente — ver README). A RLS
 * definida em schema.sql/rls_policies.sql já resolve a filtragem
 * vendedor-vs-gestor na maioria dos métodos; por isso boa parte das
 * queries aqui não faz filtro manual por `profile` (diferente do
 * mockRepository, que precisa simular a RLS em JS).
 */
class SupabaseRepository implements DataRepository {
  async login(email: string, senha: string): Promise<Profile> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error || !data.user) {
      throw new Error('E-mail ou senha inválidos.');
    }
    const profile = await buscarProfile(data.user);
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Usuário sem perfil cadastrado — contate o gestor.');
    }
    return profile;
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  }

  async getSession(): Promise<Profile | null> {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    return buscarProfile(user);
  }

  async getDesempenhoVendedorDiario(_profile: Profile, dataEmissao: string): Promise<DesempenhoVendedorDiario[]> {
    const { data, error } = await supabase
      .from('vw_desempenho_vendedor_diario')
      .select('*')
      .eq('data_emissao', dataEmissao);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      dataEmissao: r.data_emissao,
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
      quantidadeAtendimentos: r.quantidade_atendimentos,
      quantidadeItens: r.quantidade_itens,
      itensPorAtendimento: Number(r.itens_por_atendimento ?? 0),
    }));
  }

  async getMetricasVendedorDiario(_profile: Profile, dataEmissao: string): Promise<MetricasVendedorDiario[]> {
    const { data, error } = await supabase.from('vw_metricas_vendedor_diario').select('*').eq('data_emissao', dataEmissao);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      dataEmissao: r.data_emissao,
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
      qtdNotas: r.qtd_notas,
      faturamentoLiquido: Number(r.faturamento_liquido),
      faturamentoBruto: Number(r.faturamento_bruto),
      totalDesconto: Number(r.total_desconto),
      taxaDescontoPct: Number(r.taxa_desconto_pct ?? 0),
      comissaoEstimada: Number(r.comissao_estimada),
      ticketMedio: Number(r.ticket_medio ?? 0),
      totalCusto: Number(r.total_custo),
      margemBrutaPct: Number(r.margem_bruta_pct ?? 0),
    }));
  }

  // vw_ranking_vendedores_dia roda sem RLS de propósito (gamificação —
  // todo vendedor vê o placar inteiro), então não precisa de filtro por
  // profile aqui, igual ao mock.
  async getRankingVendedoresDia(_profile: Profile, dataEmissao: string): Promise<RankingVendedorDia[]> {
    const { data, error } = await supabase.from('vw_ranking_vendedores_dia').select('*').eq('data_emissao', dataEmissao);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      dataEmissao: r.data_emissao,
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
      faturamentoLiquido: Number(r.faturamento_liquido),
      posicao: r.posicao,
    }));
  }

  // vw_clientes_inatividade já faz o próprio controle de acesso no
  // WHERE (vendedor só vê os clientes dele) — select('*') simples basta.
  async getClientesInatividade(_profile: Profile): Promise<ClienteInatividade[]> {
    const { data, error } = await supabase.from('vw_clientes_inatividade').select('*');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      codigo: r.codigo,
      nome: r.nome,
      telefone: r.telefone,
      ultimaCompra: r.ultima_compra,
      diasSemComprar: r.dias_sem_comprar,
      inativo: r.inativo,
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
    }));
  }

  // vw_produtos_promocao_clientes também roda sem RLS de propósito —
  // qualquer vendedor vê oportunidade de contato de qualquer cliente.
  async getProdutosEmPromocao(_profile: Profile): Promise<ProdutoPromocaoAlerta[]> {
    const { data, error } = await supabase
      .from('vw_produtos_promocao_clientes')
      .select('*')
      .order('percentual_desconto', { ascending: false });
    if (error) throw error;

    const porProduto = new Map<number, ProdutoPromocaoAlerta>();
    for (const r of data ?? []) {
      let alerta = porProduto.get(r.codigo_produto);
      if (!alerta) {
        alerta = {
          produto: {
            codigo: r.codigo_produto,
            nome: r.nome_produto,
            precoAtual: Number(r.preco_atual),
            precoAnterior: r.preco_anterior != null ? Number(r.preco_anterior) : null,
            emPromocao: true,
            percentualDesconto: r.percentual_desconto != null ? Number(r.percentual_desconto) : null,
            exigeReceita: r.exige_receita,
            tipoReceita: r.tipo_receita,
          },
          clientes: [],
        };
        porProduto.set(r.codigo_produto, alerta);
      }
      alerta.clientes.push({
        codigoCliente: r.codigo_cliente,
        nomeCliente: r.nome_cliente,
        telefone: r.telefone_cliente,
        ultimaCompraProduto: r.ultima_compra_produto,
        quantidade: Number(r.quantidade_total),
      });
    }
    return Array.from(porProduto.values());
  }

  async getVendasComReceita(_profile: Profile): Promise<VendaReceitaPendente[]> {
    const { data, error } = await supabase.from('vw_vendas_receita_status').select('*');
    if (error) throw error;

    const linhas: VendaReceitaPendente[] = (data ?? []).map((r) => ({
      itemId: String(r.venda_item_id),
      dataVenda: r.data_venda,
      codigoProduto: r.codigo_produto,
      nomeProduto: r.nome_produto,
      tipoReceita: r.tipo_receita as TipoReceita,
      codigoCliente: r.codigo_cliente,
      nomeCliente: r.nome_cliente ?? '—',
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
      receitaAnexada: r.receita_anexada,
      receitaDataAnexo: r.data_anexo,
      receitaFotoUri: r.foto_url,
    }));

    linhas.sort((a, b) => {
      if (a.receitaAnexada !== b.receitaAnexada) return a.receitaAnexada ? 1 : -1;
      return b.dataVenda.localeCompare(a.dataVenda);
    });
    return linhas;
  }

  // Convenção de path fixada em storage_setup.sql: as policies do bucket
  // "receitas" checam o primeiro segmento do path contra
  // profiles.codigo_vendedor — subir fora desse formato quebra a RLS de
  // Storage (vendedor não consegue nem ler a própria foto).
  async anexarReceita(itemId: string, info: { tipo: TipoReceita; fotoUri: string | null }): Promise<void> {
    const { data: item, error: itemError } = await supabase
      .from('venda_itens')
      .select('id, codigo_vendedor')
      .eq('id', itemId)
      .single();
    if (itemError || !item) throw new Error('Item de venda não encontrado.');

    let fotoUrl: string | null = null;
    if (info.fotoUri) {
      const path = `${item.codigo_vendedor}/${itemId}.jpg`;
      const resposta = await fetch(info.fotoUri);
      const blob = await resposta.blob();
      const { error: uploadError } = await supabase.storage.from('receitas').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadError) throw uploadError;
      fotoUrl = path;
    }

    const { data: sessao } = await supabase.auth.getUser();
    const { error } = await supabase.from('venda_item_receitas').upsert(
      {
        venda_item_id: Number(itemId),
        tipo_receita: info.tipo,
        foto_url: fotoUrl,
        anexado_por: sessao.user?.id ?? null,
        data_anexo: new Date().toISOString(),
      },
      { onConflict: 'venda_item_id' }
    );
    if (error) throw error;
  }

  async getMetas(_profile: Profile, ano: number, mes: number): Promise<MetaVendedor[]> {
    const { data, error } = await supabase.from('vw_metas_progresso').select('*').eq('ano', ano).eq('mes', mes);
    if (error) throw error;

    const porVendedor = new Map<number, MetaVendedor>();
    for (const r of data ?? []) {
      let meta = porVendedor.get(r.codigo_vendedor);
      if (!meta) {
        meta = {
          codigoVendedor: r.codigo_vendedor,
          nomeVendedor: r.nome_vendedor,
          ano,
          mes,
          valorMetaMensal: 0,
          valorRealizadoMensal: 0,
          semanas: [],
        };
        porVendedor.set(r.codigo_vendedor, meta);
      }
      if (r.semana == null) {
        meta.valorMetaMensal = Number(r.valor_meta);
        meta.valorRealizadoMensal = Number(r.valor_realizado);
      } else {
        const semana = r.semana as 1 | 2 | 3 | 4;
        meta.semanas.push({
          semana,
          rotulo: rotuloSemana(semana, ano, mes),
          valorMeta: Number(r.valor_meta),
          valorRealizado: Number(r.valor_realizado),
        });
      }
    }
    for (const meta of porVendedor.values()) {
      meta.semanas.sort((a, b) => a.semana - b.semana);
    }
    return Array.from(porVendedor.values());
  }

  // metas_mensal_unique/metas_semanal_unique são índices ÚNICOS PARCIAIS
  // (where semana is [not] null) — o on_conflict do PostgREST não infere
  // índice parcial (não dá pra mandar o WHERE junto), então upsert não
  // funciona aqui. Delete + insert é mais simples e sempre correto,
  // ainda que troque uma operação atômica por duas.
  async salvarMeta(input: SalvarMetaInput): Promise<void> {
    const linhas: { codigo_vendedor: number; ano: number; mes: number; semana: number | null; valor_meta: number }[] = [
      { codigo_vendedor: input.codigoVendedor, ano: input.ano, mes: input.mes, semana: null, valor_meta: input.valorMetaMensal },
      ...input.valoresMetaSemanal.map((valor, i) => ({
        codigo_vendedor: input.codigoVendedor,
        ano: input.ano,
        mes: input.mes,
        semana: i + 1,
        valor_meta: valor,
      })),
    ];

    for (const linha of linhas) {
      let query = supabase
        .from('metas')
        .delete()
        .eq('codigo_vendedor', linha.codigo_vendedor)
        .eq('ano', linha.ano)
        .eq('mes', linha.mes);
      query = linha.semana === null ? query.is('semana', null) : query.eq('semana', linha.semana);
      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from('metas').insert(linha);
      if (insertError) throw insertError;
    }
  }

  async getComissoesMensal(_profile: Profile, ano: number, mes: number): Promise<ComissaoMensal[]> {
    const { data, error } = await supabase.from('vw_metas_comissao').select('*').eq('ano', ano).eq('mes', mes);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      codigoVendedor: r.codigo_vendedor,
      nomeVendedor: r.nome_vendedor,
      ano,
      mes,
      valorMeta: Number(r.valor_meta),
      valorRealizado: Number(r.valor_realizado),
      percentualAtingido: Number(r.percentual_atingido ?? 0),
      margemBrutaValor: Number(r.margem_bruta_valor),
      percentualComissao: Number(r.percentual_comissao),
      comissaoValor: Number(r.comissao_valor),
    }));
  }

  async getFaixasComissao(): Promise<FaixaComissao[]> {
    const { data, error } = await supabase
      .from('faixas_comissao')
      .select('percentual_meta_min, percentual_comissao')
      .order('percentual_meta_min', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      percentualMetaMin: Number(r.percentual_meta_min),
      percentualComissao: Number(r.percentual_comissao),
    }));
  }

  // RLS já resolve a diferença vendedor-vê-só-ativas vs gestor-vê-tudo
  // (ver "atividades_checklist: vendedor le as ativas" em
  // rls_policies.sql) — não precisa filtrar de novo aqui.
  async getAtividadesChecklist(_profile: Profile): Promise<AtividadeChecklist[]> {
    const { data, error } = await supabase.from('atividades_checklist').select('id, titulo, horario, ativo').order('titulo');
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: String(r.id), titulo: r.titulo, horario: r.horario, ativo: r.ativo }));
  }

  async salvarAtividadeChecklist(input: { id?: string; titulo: string; horario: string | null }): Promise<void> {
    if (input.id) {
      const { error } = await supabase
        .from('atividades_checklist')
        .update({ titulo: input.titulo, horario: input.horario })
        .eq('id', input.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('atividades_checklist').insert({ titulo: input.titulo, horario: input.horario });
      if (error) throw error;
    }
  }

  async alternarAtividadeChecklist(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase.from('atividades_checklist').update({ ativo }).eq('id', id);
    if (error) throw error;
  }

  async getChecklistHoje(profile: Profile): Promise<ChecklistItemStatus[]> {
    const hojeIso = new Date().toISOString().slice(0, 10);
    const [{ data: atividades, error: erroAtividades }, { data: respostas, error: erroRespostas }] = await Promise.all([
      supabase.from('atividades_checklist').select('id, titulo, horario, ativo').eq('ativo', true).order('titulo'),
      supabase
        .from('checklist_respostas')
        .select('atividade_id, concluida')
        .eq('codigo_vendedor', profile.codigoVendedor)
        .eq('data', hojeIso),
    ]);
    if (erroAtividades) throw erroAtividades;
    if (erroRespostas) throw erroRespostas;

    const concluidaPorAtividade = new Map<number, boolean>((respostas ?? []).map((r) => [r.atividade_id, r.concluida]));

    return (atividades ?? []).map((a) => ({
      atividade: { id: String(a.id), titulo: a.titulo, horario: a.horario, ativo: a.ativo },
      concluida: concluidaPorAtividade.get(a.id) ?? false,
    }));
  }

  // atividade_id+codigo_vendedor+data é unique CONSTRAINT de verdade
  // (não índice parcial), então onConflict funciona normalmente aqui —
  // diferente de `metas` acima.
  async marcarChecklistItem(profile: Profile, atividadeId: string, concluida: boolean): Promise<void> {
    const hojeIso = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('checklist_respostas').upsert(
      {
        atividade_id: Number(atividadeId),
        codigo_vendedor: profile.codigoVendedor,
        data: hojeIso,
        concluida,
        concluida_em: concluida ? new Date().toISOString() : null,
      },
      { onConflict: 'atividade_id,codigo_vendedor,data' }
    );
    if (error) throw error;
  }

  async getStatusSincronizacao(): Promise<StatusSincronizacao[]> {
    const { data, error } = await supabase.from('sync_control').select('entity_name, last_synced_at');
    if (error) throw error;
    return (data ?? []).map((r) => ({ entityName: r.entity_name, ultimaSincronizacao: r.last_synced_at }));
  }

  async getCatalogoProdutos(_profile: Profile): Promise<ProdutoCatalogo[]> {
    const { data, error } = await supabase.from('produto_catalogo').select('*').order('nome');
    if (error) throw error;
    return (data ?? []).map(mapearProdutoCatalogo);
  }

  async sugerirProdutosCampanha(profile: Profile, params: SugestaoCampanhaParams): Promise<ProdutoElegibilidade[]> {
    const [catalogoRes, vendaRes, campanhas] = await Promise.all([
      supabase.from('produto_catalogo').select('*'),
      supabase.from('vw_venda_recente_produto').select('*'),
      this.getCampanhas(profile),
    ]);
    if (catalogoRes.error) throw catalogoRes.error;
    if (vendaRes.error) throw vendaRes.error;

    const catalogo = (catalogoRes.data ?? []).map(mapearProdutoCatalogo);
    const vendaPorProduto = new Map(
      (vendaRes.data ?? []).map((r) => [
        r.codigo_produto,
        { quantidadeVendida30d: Number(r.quantidade_vendida_30d), diasSemVenda: r.dias_sem_venda },
      ])
    );

    const hojeIso = new Date().toISOString().slice(0, 10);
    const codigosEmCampanhaAtiva = new Set(
      campanhas.filter((c) => c.dataFim >= hojeIso).flatMap((c) => c.produtos.map((p) => p.codigoProduto))
    );

    return sugerirCandidatos(catalogo, vendaPorProduto, params, codigosEmCampanhaAtiva);
  }

  private async carregarCampanhas(filtroId?: number): Promise<Campanha[]> {
    let query = supabase
      .from('campanhas')
      .select(
        'id, nome, data_inicio, data_fim, created_at, campanha_produtos(codigo_produto, preco_promocional, percentual_desconto, quantidade_cartazes)'
      )
      .order('created_at', { ascending: false });
    if (filtroId !== undefined) query = query.eq('id', filtroId);

    const { data, error } = await query;
    if (error) throw error;

    // produto_catalogo dá nome/código de barras — campanha_produtos só
    // guarda o código. precoRegular é derivado do desconto salvo (não
    // do preço ATUAL do catálogo), pra uma campanha antiga continuar
    // consistente mesmo se o preço de tabela mudar depois.
    const { data: catalogo, error: catalogoError } = await supabase
      .from('produto_catalogo')
      .select('codigo, codigo_barras, nome');
    if (catalogoError) throw catalogoError;
    const catalogoPorCodigo = new Map((catalogo ?? []).map((p) => [p.codigo, p]));

    return (data ?? []).map((c: any) => ({
      id: String(c.id),
      nome: c.nome,
      dataInicio: c.data_inicio,
      dataFim: c.data_fim,
      criadaEm: c.created_at,
      produtos: (c.campanha_produtos ?? []).map((cp: any) => {
        const produto = catalogoPorCodigo.get(cp.codigo_produto);
        const percentualDesconto = Number(cp.percentual_desconto);
        const precoPromocional = Number(cp.preco_promocional);
        const precoRegular = percentualDesconto > 0 ? round2(precoPromocional / (1 - percentualDesconto / 100)) : precoPromocional;
        return {
          codigoProduto: cp.codigo_produto,
          codigoBarras: produto?.codigo_barras ?? '',
          nomeProduto: produto?.nome ?? `Produto ${cp.codigo_produto}`,
          precoRegular,
          precoPromocional,
          percentualDesconto,
          quantidadeCartazes: cp.quantidade_cartazes,
          dataInicio: c.data_inicio,
          dataFim: c.data_fim,
        };
      }),
    }));
  }

  async getCampanhas(_profile: Profile): Promise<Campanha[]> {
    return this.carregarCampanhas();
  }

  async salvarCampanha(input: SalvarCampanhaInput): Promise<Campanha> {
    let campanhaId: number;

    if (input.id) {
      campanhaId = Number(input.id);
      const { error } = await supabase
        .from('campanhas')
        .update({ nome: input.nome, data_inicio: input.dataInicio, data_fim: input.dataFim })
        .eq('id', campanhaId);
      if (error) throw error;

      // substitui a lista de produtos por completo — mais simples e
      // seguro do que diffar item a item (a tela já manda a lista inteira).
      const { error: deleteError } = await supabase.from('campanha_produtos').delete().eq('campanha_id', campanhaId);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await supabase
        .from('campanhas')
        .insert({ nome: input.nome, data_inicio: input.dataInicio, data_fim: input.dataFim })
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('Falha ao criar campanha.');
      campanhaId = data.id;
    }

    if (input.produtos.length > 0) {
      const { error } = await supabase.from('campanha_produtos').insert(
        input.produtos.map((p) => ({
          campanha_id: campanhaId,
          codigo_produto: p.codigoProduto,
          preco_promocional: p.precoPromocional,
          percentual_desconto: p.percentualDesconto,
          quantidade_cartazes: p.quantidadeCartazes,
        }))
      );
      if (error) throw error;
    }

    const [salva] = await this.carregarCampanhas(campanhaId);
    if (!salva) throw new Error('Campanha salva mas não encontrada ao recarregar.');
    return salva;
  }

  async excluirCampanha(id: string): Promise<void> {
    const { error } = await supabase.from('campanhas').delete().eq('id', Number(id));
    if (error) throw error;
  }

  async gerarSugestaoCompras(_profile: Profile, params: ParametrosCompra): Promise<SugestaoCompra[]> {
    const [catalogoRes, vendaRes, fornecedorRes] = await Promise.all([
      supabase.from('produto_catalogo').select('*'),
      supabase.from('vw_venda_recente_produto').select('*'),
      supabase.from('vw_produto_fornecedor_recente').select('*'),
    ]);
    if (catalogoRes.error) throw catalogoRes.error;
    if (vendaRes.error) throw vendaRes.error;
    if (fornecedorRes.error) throw fornecedorRes.error;

    const catalogo = (catalogoRes.data ?? []).map(mapearProdutoCatalogo);
    const demandaPorProduto = new Map(
      (vendaRes.data ?? []).map((r) => [r.codigo_produto, { quantidadeVendidaPeriodo: Number(r.quantidade_vendida_30d) }])
    );
    const fornecedorPorProduto = new Map(
      (fornecedorRes.data ?? []).map((r) => [
        r.codigo_produto,
        { fatorCompra: r.fator_compra, nomeFornecedor: r.nome_fornecedor },
      ])
    );

    return calcularSugestaoCompras(catalogo, demandaPorProduto, fornecedorPorProduto, params);
  }

  async getRelatorioPrecificacao(profile: Profile): Promise<ItemPrecificacao[]> {
    const [catalogoRes, vendaRes, campanhas] = await Promise.all([
      supabase.from('produto_catalogo').select('*'),
      supabase.from('vw_venda_recente_produto').select('*'),
      this.getCampanhas(profile),
    ]);
    if (catalogoRes.error) throw catalogoRes.error;
    if (vendaRes.error) throw vendaRes.error;

    const catalogo = (catalogoRes.data ?? []).map(mapearProdutoCatalogo);
    const vendaPorProduto = new Map(
      (vendaRes.data ?? []).map((r) => [
        r.codigo_produto,
        { quantidadeVendida30d: Number(r.quantidade_vendida_30d), diasSemVenda: r.dias_sem_venda },
      ])
    );

    const hojeIso = new Date().toISOString().slice(0, 10);
    const codigosComDescontoAtivo = new Set(
      campanhas.filter((c) => c.dataFim >= hojeIso).flatMap((c) => c.produtos.map((p) => p.codigoProduto))
    );

    return calcularRelatorioPrecificacao(catalogo, vendaPorProduto, codigosComDescontoAtivo);
  }
}

export const supabaseRepository = new SupabaseRepository();
