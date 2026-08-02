import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataRepository } from '../repository';
import {
  AtividadeChecklist,
  Campanha,
  ChecklistItemStatus,
  ClienteCompradorPromocao,
  ClienteDoVendedor,
  ClienteInatividade,
  ComissaoMensal,
  DesempenhoVendedorDiario,
  DesempenhoVendedorMensal,
  DesempenhoVendedorSemanal,
  FaixaComissao,
  HistoricoCompraCliente,
  ItemPrecificacao,
  MetaSemana,
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
  ResumoClientesInatividade,
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
  faixasComissaoSeed,
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
import { diasDecorridosNaSemana, rotuloSemana, semanaDoDia } from '../../lib/metas';
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


// metricasSeedHoje/desempenhoSeedHoje são um snapshot FIXO de "hoje" —
// sem variação por data, o Dashboard mostrava o mesmo faturamento
// (e, por tabela, o mesmo "realizado" na meta do dia) não importa qual
// dataEmissao fosse pedida, dando a impressão de que a meta diária
// nunca muda. A meta (alvo) em si é igual em todo dia do mês por
// design (valorMetaMensal ÷ dias do mês — ver metaDiaria() em
// lib/metas.ts, isso está correto); o que faltava era o REALIZADO
// reagir à data. Aplica uma variação determinística pelo dia do mês
// (mesmo dia = mesmo valor sempre, dia diferente = valor diferente) —
// só pra simular que o dado depende da data; no backend real isso
// viria de vendas de verdade, não precisaria disso.
function fatorVariacaoPorData(dataEmissao: string): number {
  const dia = Number(dataEmissao.slice(-2)) || 1;
  return 0.82 + ((dia % 15) / 15) * 0.36; // varia entre ~0.82x e ~1.18x
}

function metricasDoDia(dataEmissao: string): MetricasVendedorDiario[] {
  const fator = fatorVariacaoPorData(dataEmissao);
  return metricasSeedHoje.map((m) => {
    const qtdNotas = Math.max(1, Math.round(m.qtdNotas * fator));
    const faturamentoLiquido = round2(m.faturamentoLiquido * fator);
    const faturamentoBruto = round2(m.faturamentoBruto * fator);
    const totalDesconto = round2(m.totalDesconto * fator);
    const comissaoEstimada = round2(m.comissaoEstimada * fator);
    const totalCusto = round2(m.totalCusto * fator);
    return {
      dataEmissao,
      codigoVendedor: m.codigoVendedor,
      nomeVendedor: nomeVendedor(m.codigoVendedor),
      qtdNotas,
      faturamentoLiquido,
      faturamentoBruto,
      totalDesconto,
      taxaDescontoPct: round2((totalDesconto / faturamentoBruto) * 100),
      comissaoEstimada,
      ticketMedio: round2(faturamentoLiquido / qtdNotas),
      totalCusto,
      margemBrutaPct: round2(((faturamentoLiquido - totalCusto) / faturamentoLiquido) * 100),
    };
  });
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
    const fator = fatorVariacaoPorData(dataEmissao);
    const linhas = desempenhoSeedHoje.map((d) => {
      const quantidadeAtendimentos = Math.max(1, Math.round(d.quantidadeAtendimentos * fator));
      const quantidadeItens = Math.max(1, Math.round(d.quantidadeItens * fator));
      return {
        dataEmissao,
        codigoVendedor: d.codigoVendedor,
        nomeVendedor: nomeVendedor(d.codigoVendedor),
        quantidadeAtendimentos,
        quantidadeItens,
        itensPorAtendimento: round2(quantidadeItens / quantidadeAtendimentos),
      };
    });
    return delay(visivelParaPerfil(profile, linhas));
  }

  async getMetricasVendedorDiario(profile: Profile, dataEmissao: string): Promise<MetricasVendedorDiario[]> {
    return delay(visivelParaPerfil(profile, metricasDoDia(dataEmissao)));
  }

  // Mock aproximado: soma metricasSeedHoje ao longo dos dias já
  // decorridos do mês (ou o mês inteiro, se for um mês passado) — não
  // tem pretensão de ser fiel dia a dia, só de dar um número plausível
  // pro card "Desempenho do mês" enquanto o mock não é mais usado
  // (Frente 2/Supabase real já é o repositório ativo).
  async getDesempenhoVendedorMensal(profile: Profile, ano: number, mes: number): Promise<DesempenhoVendedorMensal[]> {
    const hoje = new Date();
    const ehMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
    const dias = ehMesCorrente ? hoje.getDate() : new Date(ano, mes, 0).getDate();
    const linhas = desempenhoSeedHoje.map((d) => {
      const quantidadeAtendimentos = Math.max(1, Math.round(d.quantidadeAtendimentos * dias));
      const quantidadeItens = Math.max(1, Math.round(d.quantidadeItens * dias));
      return {
        ano,
        mes,
        codigoVendedor: d.codigoVendedor,
        nomeVendedor: nomeVendedor(d.codigoVendedor),
        quantidadeAtendimentos,
        quantidadeItens,
        itensPorAtendimento: round2(quantidadeItens / quantidadeAtendimentos),
      };
    });
    return delay(visivelParaPerfil(profile, linhas));
  }

  async getMetricasVendedorMensal(profile: Profile, ano: number, mes: number): Promise<MetricasVendedorMensal[]> {
    const hoje = new Date();
    const ehMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
    const dias = ehMesCorrente ? hoje.getDate() : new Date(ano, mes, 0).getDate();
    const linhas = metricasSeedHoje.map((m) => {
      const qtdNotas = Math.max(1, Math.round(m.qtdNotas * dias));
      const faturamentoLiquido = round2(m.faturamentoLiquido * dias);
      const faturamentoBruto = round2(m.faturamentoBruto * dias);
      const totalDesconto = round2(m.totalDesconto * dias);
      const comissaoEstimada = round2(m.comissaoEstimada * dias);
      const totalCusto = round2(m.totalCusto * dias);
      return {
        ano,
        mes,
        codigoVendedor: m.codigoVendedor,
        nomeVendedor: nomeVendedor(m.codigoVendedor),
        qtdNotas,
        faturamentoLiquido,
        faturamentoBruto,
        totalDesconto,
        taxaDescontoPct: round2((totalDesconto / faturamentoBruto) * 100),
        comissaoEstimada,
        ticketMedio: round2(faturamentoLiquido / qtdNotas),
        totalCusto,
        margemBrutaPct: round2(((faturamentoLiquido - totalCusto) / faturamentoLiquido) * 100),
      };
    });
    return delay(visivelParaPerfil(profile, linhas));
  }

  async getDesempenhoVendedorSemanal(
    profile: Profile,
    ano: number,
    mes: number,
    semana: 1 | 2 | 3 | 4
  ): Promise<DesempenhoVendedorSemanal[]> {
    const dias = diasDecorridosNaSemana(ano, mes, semana);
    const linhas = desempenhoSeedHoje.map((d) => {
      const quantidadeAtendimentos = Math.max(1, Math.round(d.quantidadeAtendimentos * dias));
      const quantidadeItens = Math.max(1, Math.round(d.quantidadeItens * dias));
      return {
        ano,
        mes,
        semana,
        codigoVendedor: d.codigoVendedor,
        nomeVendedor: nomeVendedor(d.codigoVendedor),
        quantidadeAtendimentos,
        quantidadeItens,
        itensPorAtendimento: round2(quantidadeItens / quantidadeAtendimentos),
      };
    });
    return delay(visivelParaPerfil(profile, linhas));
  }

  async getMetricasVendedorSemanal(
    profile: Profile,
    ano: number,
    mes: number,
    semana: 1 | 2 | 3 | 4
  ): Promise<MetricasVendedorSemanal[]> {
    const dias = diasDecorridosNaSemana(ano, mes, semana);
    const linhas = metricasSeedHoje.map((m) => {
      const qtdNotas = Math.max(1, Math.round(m.qtdNotas * dias));
      const faturamentoLiquido = round2(m.faturamentoLiquido * dias);
      const faturamentoBruto = round2(m.faturamentoBruto * dias);
      const totalDesconto = round2(m.totalDesconto * dias);
      const comissaoEstimada = round2(m.comissaoEstimada * dias);
      const totalCusto = round2(m.totalCusto * dias);
      return {
        ano,
        mes,
        semana,
        codigoVendedor: m.codigoVendedor,
        nomeVendedor: nomeVendedor(m.codigoVendedor),
        qtdNotas,
        faturamentoLiquido,
        faturamentoBruto,
        totalDesconto,
        taxaDescontoPct: round2((totalDesconto / faturamentoBruto) * 100),
        comissaoEstimada,
        ticketMedio: round2(faturamentoLiquido / qtdNotas),
        totalCusto,
        margemBrutaPct: round2(((faturamentoLiquido - totalCusto) / faturamentoLiquido) * 100),
      };
    });
    return delay(visivelParaPerfil(profile, linhas));
  }

  // Ranking é gamificação: mostra todo mundo, mesmo pra quem loga como
  // vendedor (decisão de produto — motivar competição só funciona se
  // todos veem o placar completo). Por isso NÃO usa visivelParaPerfil
  // aqui, ao contrário dos outros métodos deste repositório.
  async getRankingVendedoresDia(_profile: Profile, dataEmissao: string): Promise<RankingVendedorDia[]> {
    const ordenado = metricasDoDia(dataEmissao).sort((a, b) => b.faturamentoLiquido - a.faturamentoLiquido);
    const ranking = ordenado.map((m, index) => ({
      dataEmissao,
      codigoVendedor: m.codigoVendedor,
      nomeVendedor: m.nomeVendedor,
      faturamentoLiquido: m.faturamentoLiquido,
      posicao: index + 1,
    }));
    return delay(ranking);
  }

  async getClientesInatividade(profile: Profile): Promise<ClienteInatividade[]> {
    const hoje = new Date();
    // cliente que nunca comprou nada não entra aqui — essa lista é pra
    // gerar ação de RESGATE, não tem o que resgatar de quem nunca foi
    // cliente de fato (mesmo critério da vw_clientes_inatividade real).
    const linhas = clientesSeed
      .filter((c) => c.diasSemComprar != null)
      .map((c) => {
        const ultimaCompra = new Date(hoje.getTime() - c.diasSemComprar! * 86400000).toISOString().slice(0, 10);
        return {
          codigo: c.codigo,
          nome: c.nome,
          telefone: c.telefone,
          ultimaCompra,
          diasSemComprar: c.diasSemComprar,
          inativo: c.diasSemComprar! > 60,
          codigoVendedor: c.codigoVendedor,
          nomeVendedor: c.codigoVendedor != null ? nomeVendedor(c.codigoVendedor) : null,
        };
      });

    // gestor vê todos; vendedor só os clientes cuja última compra foi
    // com ele mesmo.
    const visivel = profile.role === 'gestor' ? linhas : linhas.filter((l) => l.codigoVendedor === profile.codigoVendedor);

    return delay(visivel);
  }

  async getResumoClientesInatividade(profile: Profile): Promise<ResumoClientesInatividade> {
    const linhas = await this.getClientesInatividade(profile);
    return { total: linhas.length, inativos: linhas.filter((l) => l.inativo).length };
  }

  async getClientesDoVendedor(profile: Profile): Promise<ClienteDoVendedor[]> {
    if (profile.codigoVendedor == null) return delay([]);
    const doVendedor = vendaItensDetalheSeed.filter((v) => v.codigoVendedor === profile.codigoVendedor);
    const porCliente = new Map<number, { valorTotal: number; ultimaCompra: string }>();
    for (const item of doVendedor) {
      const produto = produtosSeed.find((p) => p.codigo === item.codigoProduto);
      const valor = (produto?.precoAtual ?? 0) * item.quantidade;
      const data = dataDiasAtras(item.diasAtras);
      const atual = porCliente.get(item.codigoCliente);
      porCliente.set(item.codigoCliente, {
        valorTotal: round2((atual?.valorTotal ?? 0) + valor),
        ultimaCompra: atual && atual.ultimaCompra > data ? atual.ultimaCompra : data,
      });
    }
    const linhas = Array.from(porCliente.entries())
      .map(([codigo, agregado]) => ({
        codigo,
        nome: nomeCliente(codigo),
        telefone: telefoneCliente(codigo),
        email: null,
        dataNascimento: null,
        ...agregado,
      }))
      .sort((a, b) => b.ultimaCompra.localeCompare(a.ultimaCompra));
    return delay(linhas);
  }

  async getHistoricoComprasCliente(_profile: Profile, codigoCliente: number): Promise<HistoricoCompraCliente[]> {
    const linhas = vendaItensDetalheSeed
      .filter((v) => v.codigoCliente === codigoCliente)
      .map((item, indice) => {
        const produto = produtosSeed.find((p) => p.codigo === item.codigoProduto);
        return {
          itemId: indice + 1,
          vendaId: indice + 1,
          dataEmissao: dataDiasAtras(item.diasAtras),
          codigoProduto: item.codigoProduto,
          nomeProduto: produto?.nome ?? `Produto ${item.codigoProduto}`,
          quantidade: item.quantidade,
          valorTotal: round2((produto?.precoAtual ?? 0) * item.quantidade),
        };
      })
      .sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))
      .slice(0, 5);
    return delay(linhas);
  }

  async getProdutosRecorrentesDoVendedor(profile: Profile): Promise<ProdutoRecorrenteCliente[]> {
    if (profile.codigoVendedor == null) return delay([]);
    const doVendedor = vendaItensDetalheSeed.filter((v) => v.codigoVendedor === profile.codigoVendedor);
    const porChave = new Map<string, { codigoCliente: number; codigoProduto: number; datas: string[] }>();
    for (const item of doVendedor) {
      const chave = `${item.codigoCliente}-${item.codigoProduto}`;
      const atual = porChave.get(chave) ?? { codigoCliente: item.codigoCliente, codigoProduto: item.codigoProduto, datas: [] };
      atual.datas.push(dataDiasAtras(item.diasAtras));
      porChave.set(chave, atual);
    }
    const linhas = Array.from(porChave.values()).map(({ codigoCliente, codigoProduto, datas }) => {
      const produto = produtosSeed.find((p) => p.codigo === codigoProduto);
      const ordenadas = datas.slice().sort();
      const ultimaCompra = ordenadas[ordenadas.length - 1];
      const qtdCompras = ordenadas.length;
      const diasDesdeUltimaCompra = Math.round(
        (Date.now() - new Date(ultimaCompra).getTime()) / 86400000
      );
      const intervaloMedioDias =
        qtdCompras >= 2
          ? Math.round(
              (new Date(ultimaCompra).getTime() - new Date(ordenadas[0]).getTime()) / 86400000 / (qtdCompras - 1)
            )
          : null;
      const recorrente = qtdCompras >= 2;
      const atrasado = recorrente && intervaloMedioDias != null && diasDesdeUltimaCompra > intervaloMedioDias * 1.3;
      return {
        codigoCliente,
        codigoProduto,
        nomeProduto: produto?.nome ?? `Produto ${codigoProduto}`,
        categoria: null,
        grupo: null,
        qtdCompras,
        ultimaCompra,
        intervaloMedioDias,
        diasDesdeUltimaCompra,
        recorrente,
        atrasado,
      };
    });
    return delay(linhas);
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

  async getComissoesMensal(profile: Profile, ano: number, mes: number): Promise<ComissaoMensal[]> {
    // Reaproveita getMetas (já filtra por perfil: vendedor só a própria
    // linha, gestor todas) — mesma regra de visibilidade de vw_metas_comissao.
    const metas = await this.getMetas(profile, ano, mes);

    const faixaPara = (percentual: number): FaixaComissao =>
      faixasComissaoSeed
        .filter((f) => f.percentualMetaMin <= percentual)
        .sort((a, b) => b.percentualMetaMin - a.percentualMetaMin)[0]
        ?? faixasComissaoSeed[faixasComissaoSeed.length - 1];

    const comissoes: ComissaoMensal[] = metas.map((meta) => {
      // valorRealizadoMensal/valorRealizado de semana JÁ são margem bruta
      // (vw_metas_progresso troca faturamento por margem) — mock espelha
      // a mesma unidade, sem proxy de %.
      const margemBrutaValor = meta.valorRealizadoMensal;
      const percentualAtingido = meta.valorMetaMensal > 0
        ? (meta.valorRealizadoMensal / meta.valorMetaMensal) * 100
        : 0;

      const bateuMeta = meta.valorMetaMensal > 0 && meta.valorRealizadoMensal >= meta.valorMetaMensal;

      let comissaoValor: number;
      let regraAplicada: ComissaoMensal['regraAplicada'];
      let detalheSemanas: ComissaoMensal['detalheSemanas'];

      if (bateuMeta) {
        comissaoValor = Math.round(margemBrutaValor * 0.10 * 100) / 100;
        regraAplicada = 'flat_10_mensal';
        detalheSemanas = null;
      } else {
        const semanas = meta.semanas.map((s) => {
          const percentual = s.valorMeta > 0 ? (s.valorRealizado / s.valorMeta) * 100 : 0;
          const taxa = faixaPara(percentual).percentualComissao;
          const comissao = Math.round(s.valorRealizado * (taxa / 100) * 100) / 100;
          return { semana: s.semana, margem: s.valorRealizado, meta: s.valorMeta, percentual: Math.round(percentual * 100) / 100, taxa, comissao };
        });
        comissaoValor = Math.round(semanas.reduce((sum, s) => sum + s.comissao, 0) * 100) / 100;
        regraAplicada = 'soma_semanal';
        detalheSemanas = semanas;
      }

      return {
        codigoVendedor: meta.codigoVendedor,
        nomeVendedor: meta.nomeVendedor,
        ano,
        mes,
        valorMeta: meta.valorMetaMensal,
        valorRealizado: meta.valorRealizadoMensal,
        percentualAtingido: Math.round(percentualAtingido * 100) / 100,
        margemBrutaValor: Math.round(margemBrutaValor * 100) / 100,
        percentualComissao: margemBrutaValor > 0 ? Math.round((comissaoValor / margemBrutaValor) * 10000) / 100 : 0,
        comissaoValor,
        regraAplicada,
        detalheSemanas,
      };
    });

    return delay(comissoes);
  }

  async getFaixasComissao(): Promise<FaixaComissao[]> {
    return delay(faixasComissaoSeed);
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
