import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataRepository } from '../repository';
import {
  AtividadeChecklist,
  Campanha,
  ChecklistItemStatus,
  ClienteCompradorPromocao,
  ClienteInatividade,
  DesempenhoVendedorDiario,
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
  SalvarCampanhaInput,
  SalvarMetaInput,
  StatusSincronizacao,
  SugestaoCampanhaParams,
  SugestaoCompra,
  TipoReceita,
  VendaReceitaPendente,
} from '../../types/domain';
import {
  GESTOR_EMAIL,
  MOCK_PASSWORD,
  atividadesChecklistSeed,
  catalogoProdutosSeed,
  clientesSeed,
  compraInfoSeed,
  desempenhoSeedHoje,
  fornecedoresSeed,
  metasSeedPadrao,
  metricasSeedHoje,
  produtosSeed,
  realizadoSeedPadrao,
  syncControlSeed,
  vendaItensDetalheSeed,
  vendaRecenteSeed,
  vendedoresSeed,
} from './seed';
import { rotuloSemana, semanaDoDia } from '../../lib/metas';
import { sugerirCandidatos } from '../../lib/campanhas';
import { calcularSugestaoCompras } from '../../lib/doseCerta';
import { calcularRelatorioPrecificacao } from '../../lib/precificacao';

const SESSION_KEY = '@farmapp/session';
const RECEITAS_OVERRIDES_KEY = '@farmapp/receitas_overrides';
const METAS_OVERRIDES_KEY = '@farmapp/metas_overrides';
const CHECKLIST_ATIVIDADES_KEY = '@farmapp/checklist_atividades';
const CHECKLIST_RESPOSTAS_KEY = '@farmapp/checklist_respostas';
const CAMPANHAS_KEY = '@farmapp/campanhas';
const SIMULATED_LATENCY_MS = 350;

interface ReceitaOverride {
  receitaAnexada: boolean;
  receitaDataAnexo: string | null;
  receitaFotoUri: string | null;
}

interface MetaOverride {
  valorMetaMensal: number;
  valoresMetaSemanal: [number, number, number, number];
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

function nomeVendedor(codigo: number): string {
  return vendedoresSeed.find((v) => v.codigo === codigo)?.nome ?? `Vendedor ${codigo}`;
}

function nomeCliente(codigo: number): string {
  return clientesSeed.find((c) => c.codigo === codigo)?.nome ?? `Cliente ${codigo}`;
}

function telefoneCliente(codigo: number): string | null {
  return clientesSeed.find((c) => c.codigo === codigo)?.telefone ?? null;
}

function dataDiasAtras(diasAtras: number): string {
  const data = new Date();
  data.setDate(data.getDate() - diasAtras);
  return data.toISOString().slice(0, 10);
}

// Igual à RLS real: gestor vê tudo; vendedor só as linhas do próprio codigo_vendedor.
function visivelParaPerfil<T extends { codigoVendedor: number }>(profile: Profile, linhas: T[]): T[] {
  if (profile.role === 'gestor') return linhas;
  return linhas.filter((linha) => linha.codigoVendedor === profile.codigoVendedor);
}

async function getReceitasOverrides(): Promise<Record<string, ReceitaOverride>> {
  const raw = await AsyncStorage.getItem(RECEITAS_OVERRIDES_KEY);
  return raw ? (JSON.parse(raw) as Record<string, ReceitaOverride>) : {};
}

async function getMetasOverrides(): Promise<Record<string, MetaOverride>> {
  const raw = await AsyncStorage.getItem(METAS_OVERRIDES_KEY);
  return raw ? (JSON.parse(raw) as Record<string, MetaOverride>) : {};
}

async function getAtividadesStore(): Promise<AtividadeChecklist[]> {
  const raw = await AsyncStorage.getItem(CHECKLIST_ATIVIDADES_KEY);
  if (raw) {
    const armazenadas = JSON.parse(raw) as AtividadeChecklist[];
    // migra registros salvos numa versão anterior a existir o campo
    // horario (senão fica "preso" sem horário até apagar o app).
    let precisaMigrar = false;
    const migradas = armazenadas.map((a) => {
      if (a.horario !== undefined) return a;
      precisaMigrar = true;
      const doSeed = atividadesChecklistSeed.find((s) => s.id === a.id);
      return { ...a, horario: doSeed?.horario ?? null };
    });
    if (precisaMigrar) {
      await AsyncStorage.setItem(CHECKLIST_ATIVIDADES_KEY, JSON.stringify(migradas));
    }
    return migradas;
  }
  const inicial = atividadesChecklistSeed.map((a) => ({ ...a }));
  await AsyncStorage.setItem(CHECKLIST_ATIVIDADES_KEY, JSON.stringify(inicial));
  return inicial;
}

async function getRespostasStore(): Promise<Record<string, boolean>> {
  const raw = await AsyncStorage.getItem(CHECKLIST_RESPOSTAS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
}

async function getCampanhasStore(): Promise<Campanha[]> {
  const raw = await AsyncStorage.getItem(CAMPANHAS_KEY);
  return raw ? (JSON.parse(raw) as Campanha[]) : [];
}

async function salvarCampanhasStore(campanhas: Campanha[]): Promise<void> {
  await AsyncStorage.setItem(CAMPANHAS_KEY, JSON.stringify(campanhas));
}

class MockRepository implements DataRepository {
  async login(email: string, senha: string): Promise<Profile> {
    if (senha !== MOCK_PASSWORD) {
      throw new Error('E-mail ou senha inválidos.');
    }

    let profile: Profile;
    if (email.toLowerCase() === GESTOR_EMAIL) {
      profile = { id: 'gestor-1', nome: 'Gestor(a) da Farmácia', email, role: 'gestor', codigoVendedor: null };
    } else {
      const vendedor = vendedoresSeed.find((v) => v.email.toLowerCase() === email.toLowerCase());
      if (!vendedor) {
        throw new Error('E-mail ou senha inválidos.');
      }
      profile = { id: `vendedor-${vendedor.codigo}`, nome: vendedor.nome, email, role: 'vendedor', codigoVendedor: vendedor.codigo };
    }

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    return delay(profile);
  }

  async logout(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }

  async getSession(): Promise<Profile | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  }

  async getDesempenhoVendedorDiario(profile: Profile, dataEmissao: string): Promise<DesempenhoVendedorDiario[]> {
    const linhas = desempenhoSeedHoje.map((d) => ({
      dataEmissao,
      codigoVendedor: d.codigoVendedor,
      nomeVendedor: nomeVendedor(d.codigoVendedor),
      quantidadeAtendimentos: d.quantidadeAtendimentos,
      quantidadeItens: d.quantidadeItens,
      itensPorAtendimento: round2(d.quantidadeItens / d.quantidadeAtendimentos),
    }));
    return delay(visivelParaPerfil(profile, linhas));
  }

  async getMetricasVendedorDiario(profile: Profile, dataEmissao: string): Promise<MetricasVendedorDiario[]> {
    const linhas = metricasSeedHoje.map((m) => ({
      dataEmissao,
      codigoVendedor: m.codigoVendedor,
      nomeVendedor: nomeVendedor(m.codigoVendedor),
      qtdNotas: m.qtdNotas,
      faturamentoLiquido: m.faturamentoLiquido,
      faturamentoBruto: m.faturamentoBruto,
      totalDesconto: m.totalDesconto,
      taxaDescontoPct: round2((m.totalDesconto / m.faturamentoBruto) * 100),
      comissaoEstimada: m.comissaoEstimada,
      ticketMedio: round2(m.faturamentoLiquido / m.qtdNotas),
      totalCusto: m.totalCusto,
      margemBrutaPct: round2(((m.faturamentoLiquido - m.totalCusto) / m.faturamentoLiquido) * 100),
    }));
    return delay(visivelParaPerfil(profile, linhas));
  }

  // Ranking é gamificação: mostra todo mundo, mesmo pra quem loga como
  // vendedor (decisão de produto — motivar competição só funciona se
  // todos veem o placar completo). Por isso NÃO usa visivelParaPerfil
  // aqui, ao contrário dos outros métodos deste repositório.
  async getRankingVendedoresDia(_profile: Profile, dataEmissao: string): Promise<RankingVendedorDia[]> {
    const ordenado = [...metricasSeedHoje].sort((a, b) => b.faturamentoLiquido - a.faturamentoLiquido);
    const ranking = ordenado.map((m, index) => ({
      dataEmissao,
      codigoVendedor: m.codigoVendedor,
      nomeVendedor: nomeVendedor(m.codigoVendedor),
      faturamentoLiquido: m.faturamentoLiquido,
      posicao: index + 1,
    }));
    return delay(ranking);
  }

  async getClientesInatividade(profile: Profile): Promise<ClienteInatividade[]> {
    const hoje = new Date();
    const linhas = clientesSeed.map((c) => {
      const ultimaCompra =
        c.diasSemComprar == null
          ? null
          : new Date(hoje.getTime() - c.diasSemComprar * 86400000).toISOString().slice(0, 10);
      return {
        codigo: c.codigo,
        nome: c.nome,
        telefone: c.telefone,
        ultimaCompra,
        diasSemComprar: c.diasSemComprar,
        inativo: c.diasSemComprar != null && c.diasSemComprar > 60,
        codigoVendedor: c.codigoVendedor,
        nomeVendedor: c.codigoVendedor != null ? nomeVendedor(c.codigoVendedor) : null,
      };
    });

    // gestor vê todos; vendedor só os clientes cuja última compra foi
    // com ele mesmo (cliente sem histórico nenhum não aparece pra
    // nenhum vendedor específico, só pro gestor).
    const visivel = profile.role === 'gestor' ? linhas : linhas.filter((l) => l.codigoVendedor === profile.codigoVendedor);

    return delay(visivel);
  }

  async getProdutosEmPromocao(_profile: Profile): Promise<ProdutoPromocaoAlerta[]> {
    const alertas = produtosSeed
      .filter((p) => p.emPromocao)
      .map((produto) => {
        const compras = vendaItensDetalheSeed.filter((v) => v.codigoProduto === produto.codigo);

        const porCliente = new Map<number, ClienteCompradorPromocao>();
        for (const compra of compras) {
          const dataCompra = dataDiasAtras(compra.diasAtras);
          const existente = porCliente.get(compra.codigoCliente);
          if (!existente || dataCompra > existente.ultimaCompraProduto) {
            porCliente.set(compra.codigoCliente, {
              codigoCliente: compra.codigoCliente,
              nomeCliente: nomeCliente(compra.codigoCliente),
              telefone: telefoneCliente(compra.codigoCliente),
              ultimaCompraProduto: dataCompra,
              quantidade: compra.quantidade,
            });
          }
        }

        const clientes = Array.from(porCliente.values()).sort((a, b) =>
          b.ultimaCompraProduto.localeCompare(a.ultimaCompraProduto)
        );

        return { produto, clientes };
      })
      .sort((a, b) => (b.produto.percentualDesconto ?? 0) - (a.produto.percentualDesconto ?? 0));

    return delay(alertas);
  }

  async getVendasComReceita(profile: Profile): Promise<VendaReceitaPendente[]> {
    const overrides = await getReceitasOverrides();

    const produtosComReceita = new Set(produtosSeed.filter((p) => p.exigeReceita).map((p) => p.codigo));
    const linhas = vendaItensDetalheSeed
      .filter((v) => produtosComReceita.has(v.codigoProduto))
      .map((v) => {
        const produto = produtosSeed.find((p) => p.codigo === v.codigoProduto)!;
        const override = overrides[v.id];
        const anexadaSeed = v.receitaAnexadaSeed ?? false;

        const receitaAnexada = override?.receitaAnexada ?? anexadaSeed;
        const receitaDataAnexo =
          override?.receitaDataAnexo ?? (anexadaSeed ? dataDiasAtras(Math.max(v.diasAtras - 1, 0)) : null);
        const receitaFotoUri = override?.receitaFotoUri ?? null;

        return {
          itemId: v.id,
          dataVenda: dataDiasAtras(v.diasAtras),
          codigoProduto: v.codigoProduto,
          nomeProduto: produto.nome,
          tipoReceita: produto.tipoReceita as TipoReceita,
          codigoCliente: v.codigoCliente,
          nomeCliente: nomeCliente(v.codigoCliente),
          codigoVendedor: v.codigoVendedor,
          nomeVendedor: nomeVendedor(v.codigoVendedor),
          receitaAnexada,
          receitaDataAnexo,
          receitaFotoUri,
        };
      });

    const visivel = visivelParaPerfil(profile, linhas);
    // pendentes primeiro, mais recentes primeiro
    visivel.sort((a, b) => {
      if (a.receitaAnexada !== b.receitaAnexada) return a.receitaAnexada ? 1 : -1;
      return b.dataVenda.localeCompare(a.dataVenda);
    });

    return delay(visivel);
  }

  async anexarReceita(itemId: string, info: { tipo: TipoReceita; fotoUri: string | null }): Promise<void> {
    const overrides = await getReceitasOverrides();
    overrides[itemId] = {
      receitaAnexada: true,
      receitaDataAnexo: new Date().toISOString(),
      receitaFotoUri: info.fotoUri,
    };
    await AsyncStorage.setItem(RECEITAS_OVERRIDES_KEY, JSON.stringify(overrides));
  }

  async getMetas(profile: Profile, ano: number, mes: number): Promise<MetaVendedor[]> {
    const overrides = await getMetasOverrides();
    const hoje = new Date();
    const ehMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
    const semanaAtual = semanaDoDia(hoje.getDate());

    const linhas: (MetaVendedor & { codigoVendedor: number })[] = metasSeedPadrao.map((padrao) => {
      const override = overrides[`${padrao.codigoVendedor}-${ano}-${mes}`];
      const valorMetaMensal = override?.valorMetaMensal ?? padrao.valorMetaMensal;
      const valoresMetaSemanal = override?.valoresMetaSemanal ?? padrao.valoresMetaSemanal;
      const realizado = realizadoSeedPadrao.find((r) => r.codigoVendedor === padrao.codigoVendedor);

      const semanas: MetaSemana[] = ([1, 2, 3, 4] as const).map((semana) => {
        // só mostra realizado das semanas já decorridas do mês corrente;
        // meses passados/futuros no seletor do gestor não têm "realizado" mockado.
        const semanaJaOcorreu = ehMesCorrente && semana <= semanaAtual;
        return {
          semana,
          rotulo: rotuloSemana(semana, ano, mes),
          valorMeta: valoresMetaSemanal[semana - 1],
          valorRealizado: semanaJaOcorreu ? realizado?.realizadoSemanal[semana - 1] ?? 0 : 0,
        };
      });

      const valorRealizadoMensal = semanas.reduce((acc, s) => acc + s.valorRealizado, 0);

      return {
        codigoVendedor: padrao.codigoVendedor,
        nomeVendedor: nomeVendedor(padrao.codigoVendedor),
        ano,
        mes,
        valorMetaMensal,
        valorRealizadoMensal,
        semanas,
      };
    });

    return delay(visivelParaPerfil(profile, linhas));
  }

  async salvarMeta(input: SalvarMetaInput): Promise<void> {
    const overrides = await getMetasOverrides();
    overrides[`${input.codigoVendedor}-${input.ano}-${input.mes}`] = {
      valorMetaMensal: input.valorMetaMensal,
      valoresMetaSemanal: input.valoresMetaSemanal,
    };
    await AsyncStorage.setItem(METAS_OVERRIDES_KEY, JSON.stringify(overrides));
  }

  async getAtividadesChecklist(profile: Profile): Promise<AtividadeChecklist[]> {
    const atividades = await getAtividadesStore();
    if (profile.role === 'gestor') return delay(atividades);
    return delay(atividades.filter((a) => a.ativo));
  }

  async salvarAtividadeChecklist(input: { id?: string; titulo: string; horario: string | null }): Promise<void> {
    const atividades = await getAtividadesStore();
    if (input.id) {
      const existente = atividades.find((a) => a.id === input.id);
      if (existente) {
        existente.titulo = input.titulo;
        existente.horario = input.horario;
      }
    } else {
      atividades.push({ id: `chk-${Date.now()}`, titulo: input.titulo, horario: input.horario, ativo: true });
    }
    await AsyncStorage.setItem(CHECKLIST_ATIVIDADES_KEY, JSON.stringify(atividades));
  }

  async alternarAtividadeChecklist(id: string, ativo: boolean): Promise<void> {
    const atividades = await getAtividadesStore();
    const existente = atividades.find((a) => a.id === id);
    if (existente) existente.ativo = ativo;
    await AsyncStorage.setItem(CHECKLIST_ATIVIDADES_KEY, JSON.stringify(atividades));
  }

  async getChecklistHoje(profile: Profile): Promise<ChecklistItemStatus[]> {
    const atividades = (await getAtividadesStore()).filter((a) => a.ativo);
    const respostas = await getRespostasStore();
    const hojeIso = new Date().toISOString().slice(0, 10);

    return delay(
      atividades.map((atividade) => ({
        atividade,
        concluida: respostas[`${profile.codigoVendedor}-${hojeIso}-${atividade.id}`] ?? false,
      }))
    );
  }

  async marcarChecklistItem(profile: Profile, atividadeId: string, concluida: boolean): Promise<void> {
    const respostas = await getRespostasStore();
    const hojeIso = new Date().toISOString().slice(0, 10);
    respostas[`${profile.codigoVendedor}-${hojeIso}-${atividadeId}`] = concluida;
    await AsyncStorage.setItem(CHECKLIST_RESPOSTAS_KEY, JSON.stringify(respostas));
  }

  async getStatusSincronizacao(): Promise<StatusSincronizacao[]> {
    const agora = Date.now();
    const linhas = syncControlSeed.map((s) => ({
      entityName: s.entityName,
      ultimaSincronizacao: new Date(agora - s.minutosAtras * 60_000).toISOString(),
    }));
    return delay(linhas);
  }

  async getCatalogoProdutos(_profile: Profile): Promise<ProdutoCatalogo[]> {
    return delay(catalogoProdutosSeed);
  }

  async sugerirProdutosCampanha(_profile: Profile, params: SugestaoCampanhaParams): Promise<ProdutoElegibilidade[]> {
    const vendaRecentePorProduto = new Map(
      vendaRecenteSeed.map((v) => [v.codigoProduto, { quantidadeVendida30d: v.quantidadeVendida30d, diasSemVenda: v.diasSemVenda }])
    );

    // evita sugerir de novo produto que já está em campanha nossa
    // ativa/futura — não faz sentido empilhar desconto no mesmo item.
    const campanhas = await getCampanhasStore();
    const hojeIso = new Date().toISOString().slice(0, 10);
    const codigosEmCampanhaAtiva = new Set(
      campanhas.filter((c) => c.dataFim >= hojeIso).flatMap((c) => c.produtos.map((p) => p.codigoProduto))
    );

    const sugestoes = sugerirCandidatos(catalogoProdutosSeed, vendaRecentePorProduto, params, codigosEmCampanhaAtiva);
    return delay(sugestoes);
  }

  async getCampanhas(_profile: Profile): Promise<Campanha[]> {
    const campanhas = await getCampanhasStore();
    return delay([...campanhas].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)));
  }

  async salvarCampanha(input: SalvarCampanhaInput): Promise<Campanha> {
    const campanhas = await getCampanhasStore();
    let salva: Campanha;

    if (input.id) {
      const existente = campanhas.find((c) => c.id === input.id);
      if (!existente) throw new Error('Campanha não encontrada.');
      existente.nome = input.nome;
      existente.dataInicio = input.dataInicio;
      existente.dataFim = input.dataFim;
      existente.produtos = input.produtos;
      salva = existente;
    } else {
      salva = {
        id: `camp-${Date.now()}`,
        nome: input.nome,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        criadaEm: new Date().toISOString(),
        produtos: input.produtos,
      };
      campanhas.push(salva);
    }

    await salvarCampanhasStore(campanhas);
    return delay(salva);
  }

  async gerarSugestaoCompras(_profile: Profile, params: ParametrosCompra): Promise<SugestaoCompra[]> {
    const demandaPorProduto = new Map(
      vendaRecenteSeed.map((v) => [v.codigoProduto, { quantidadeVendidaPeriodo: v.quantidadeVendida30d }])
    );
    const fornecedoresPorCodigo = new Map(fornecedoresSeed.map((f) => [f.codigo, f.nomeFantasia]));
    const fornecedorPorProduto = new Map(
      compraInfoSeed.map((c) => [
        c.codigoProduto,
        { fatorCompra: c.fatorCompra, nomeFornecedor: fornecedoresPorCodigo.get(c.codigoFornecedor) ?? null },
      ])
    );

    const sugestoes = calcularSugestaoCompras(catalogoProdutosSeed, demandaPorProduto, fornecedorPorProduto, params);
    return delay(sugestoes);
  }

  async getRelatorioPrecificacao(_profile: Profile): Promise<ItemPrecificacao[]> {
    const vendaPorProduto = new Map(
      vendaRecenteSeed.map((v) => [v.codigoProduto, { quantidadeVendida30d: v.quantidadeVendida30d, diasSemVenda: v.diasSemVenda }])
    );

    // mesmo critério de "desconto ativo" usado em sugerirProdutosCampanha
    // — produto já em campanha ativa/futura não é candidato a reajuste.
    const campanhas = await getCampanhasStore();
    const hojeIso = new Date().toISOString().slice(0, 10);
    const codigosComDescontoAtivo = new Set(
      campanhas.filter((c) => c.dataFim >= hojeIso).flatMap((c) => c.produtos.map((p) => p.codigoProduto))
    );

    const relatorio = calcularRelatorioPrecificacao(catalogoProdutosSeed, vendaPorProduto, codigosComDescontoAtivo);
    return delay(relatorio);
  }

  async excluirCampanha(id: string): Promise<void> {
    const campanhas = await getCampanhasStore();
    await salvarCampanhasStore(campanhas.filter((c) => c.id !== id));
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const mockRepository = new MockRepository();
