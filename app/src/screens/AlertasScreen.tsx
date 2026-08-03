import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { PhoneCallButton } from '../components/PhoneCallButton';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR, nomeCurto } from '../lib/format';
import { existeRegistroContato, foiContatadoRecentemente } from '../lib/contatos';
import {
  ClienteDoVendedor,
  ContatoCliente,
  HistoricoCompraCliente,
  IdentificacaoCompradorVendedor,
  MetaVendedor,
  MotivoContato,
  ProdutoPromocaoAlerta,
  ProdutoRecorrenteCliente,
  TipoContato,
  VendaAntimicrobianoRecente,
  VendaReceitaPendente,
  VendaSemIdentificacaoComprador,
} from '../types/domain';

const MOTIVO_LABEL: Record<VendaSemIdentificacaoComprador['motivo'], string> = {
  sem_cliente: 'Sem cliente na venda',
  proprio_cpf: 'No CPF do próprio vendedor',
};

// Reaproveitada nas 3 listas de Alertas que mostram cliente
// (aniversário, alto valor sumindo, e dentro de promoção) — mesmo
// comportamento de "Meus Clientes": clica no cliente, expande as
// últimas 5 compras (produto + data) do histórico completo dele
// (01/08/2026).
function LinhaClienteComHistorico({
  codigoCliente,
  nome,
  telefone,
  detalhe,
  mensagemWhatsapp,
  onContato,
}: {
  codigoCliente: number;
  nome: string;
  telefone: string | null;
  detalhe: string;
  mensagemWhatsapp: string;
  onContato?: (tipoContato: TipoContato) => void;
}) {
  const { profile } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [historico, setHistorico] = useState<HistoricoCompraCliente[]>([]);
  const [carregando, setCarregando] = useState(false);

  const alternar = async () => {
    if (aberto) {
      setAberto(false);
      return;
    }
    setAberto(true);
    if (historico.length > 0 || !profile) return;
    setCarregando(true);
    try {
      setHistorico(await repository.getHistoricoComprasCliente(profile, codigoCliente));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <View>
      <Pressable style={styles.itemRow} onPress={alternar}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemNome}>{nome}</Text>
          <Text style={styles.itemDetalhe}>{detalhe}</Text>
        </View>
        <View style={styles.itemAcoes}>
          {telefone ? (
            <>
              <PhoneCallButton compact telefone={telefone} onLigar={() => onContato?.('ligacao')} />
              <WhatsAppButton
                compact
                telefone={telefone}
                mensagem={mensagemWhatsapp}
                onEnviado={() => onContato?.('whatsapp')}
              />
            </>
          ) : null}
          <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </View>
      </Pressable>
      {aberto && (
        <View style={styles.historicoPainel}>
          {carregando ? (
            <ActivityIndicator style={{ marginTop: 6 }} />
          ) : historico.length === 0 ? (
            <Text style={styles.empty}>Sem histórico de compra encontrado.</Text>
          ) : (
            historico.map((h) => (
              <View key={h.itemId} style={styles.historicoRow}>
                <Text style={styles.historicoProduto} numberOfLines={1}>
                  {h.quantidade > 1 ? `${h.quantidade}x ` : ''}
                  {h.nomeProduto}
                </Text>
                <Text style={styles.historicoData}>{formatDateBR(h.dataEmissao)}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// Drill-down do card "Venda controlada sem comprador": clica no
// vendedor, expande as vendas específicas (nota, data, produto,
// motivo) — mesmo padrão de LinhaClienteComHistorico acima, mas sem
// ação de WhatsApp (não faz sentido aqui, é autoconferência/cobrança
// interna, não contato com cliente).
function LinhaVendedorSemComprador({ vendedor }: { vendedor: IdentificacaoCompradorVendedor }) {
  const { profile } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [vendas, setVendas] = useState<VendaSemIdentificacaoComprador[]>([]);
  const [carregando, setCarregando] = useState(false);

  const alternar = async () => {
    if (aberto) {
      setAberto(false);
      return;
    }
    setAberto(true);
    if (vendas.length > 0 || !profile) return;
    setCarregando(true);
    try {
      setVendas(await repository.getVendasSemIdentificacaoComprador(profile, vendedor.codigoVendedor));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <View>
      <Pressable style={styles.itemRow} onPress={alternar}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemNome}>{vendedor.nomeVendedor}</Text>
          <Text style={styles.itemDetalhe}>
            {vendedor.vendasSemIdentificacao} de {vendedor.totalVendasControladas} vendas de controlado
          </Text>
        </View>
        <View style={styles.itemAcoes}>
          <Text style={styles.percentualDestaque}>{vendedor.percentualSemIdentificacao.toFixed(0)}%</Text>
          <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </View>
      </Pressable>
      {aberto && (
        <View style={styles.historicoPainel}>
          {carregando ? (
            <ActivityIndicator style={{ marginTop: 6 }} />
          ) : vendas.length === 0 ? (
            <Text style={styles.empty}>Nenhuma venda encontrada.</Text>
          ) : (
            vendas.map((v) => (
              <View key={v.itemId} style={styles.historicoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historicoProduto} numberOfLines={1}>
                    Nota {v.numeroNota} · {v.nomeProduto}
                  </Text>
                  <Text style={styles.historicoMotivo}>{MOTIVO_LABEL[v.motivo]}</Text>
                </View>
                <Text style={styles.historicoData}>
                  {formatDateBR(v.dataVenda)}
                  {v.horaVenda ? ` ${v.horaVenda.slice(0, 5)}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function mensagemPromocao(alerta: ProdutoPromocaoAlerta, nomeCliente: string, ultimaCompra: string): string {
  const { produto } = alerta;
  return `Olá, ${nomeCurto(nomeCliente)}! 🎉 O ${produto.nome}, que você já levou aqui na Conviva Parquelândia (última vez em ${formatDateBR(
    ultimaCompra
  )}), entrou em promoção: -${produto.percentualDesconto}% — agora por ${formatBRL(
    produto.precoAtual
  )}. Aproveita antes que acabe!`;
}

// Próxima ocorrência do dia/mês de nascimento a partir de hoje (troca
// de ano quando já passou este ano) — pra saber "faltam quantos dias".
function diasAteProximoAniversario(dataNascimentoISO: string, hoje: Date): number {
  const [, mesStr, diaStr] = dataNascimentoISO.split('-');
  const mes = Number(mesStr) - 1;
  const dia = Number(diaStr);
  let proximo = new Date(hoje.getFullYear(), mes, dia);
  proximo.setHours(0, 0, 0, 0);
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (proximo < hojeSemHora) proximo = new Date(hoje.getFullYear() + 1, mes, dia);
  return Math.round((proximo.getTime() - hojeSemHora.getTime()) / 86400000);
}

function diasDesde(dataISO: string, hoje: Date): number {
  const data = new Date(dataISO);
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((hojeSemHora.getTime() - data.getTime()) / 86400000);
}

const JANELA_ANIVERSARIO_DIAS = 7;
const RECEITA_PENDENTE_DIAS = 7;
const CLIENTE_SUMIU_DIAS = 60;
const ANTIBIOTICO_DIAS = 7;
// Depois da janela de exibição, ainda dá mais esse tanto de dias de
// tolerância antes de marcar como "não contatado" — só existe pra não
// perder o registro se a tela ficar uns dias sem ser aberta. Vendas
// mais antigas que ANTIBIOTICO_DIAS + ANTIBIOTICO_TOLERANCIA_DIAS são
// ignoradas de vez (não aparecem, não geram 'nao_contatado') — sem
// isso, o efeito de auto-expiração varria TODO o histórico da view
// (desde 01/07/2026) na primeira vez que a tela carregasse, marcando
// como "perdida" venda de mais de um mês atrás, de antes desse card
// existir (bug encontrado com dado real em 03/08/2026: 43 registros
// criados de uma vez só, contra 18 vendas nos últimos 7 dias).
const ANTIBIOTICO_TOLERANCIA_DIAS = 7;

interface AlertaCardInfo {
  chave: string;
  emoji: string;
  titulo: string;
  contagem: number;
  cor: string;
}

export function AlertasScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const [alertasPromocao, setAlertasPromocao] = useState<ProdutoPromocaoAlerta[]>([]);
  const [clientes, setClientes] = useState<ClienteDoVendedor[]>([]);
  const [produtosRecorrentes, setProdutosRecorrentes] = useState<ProdutoRecorrenteCliente[]>([]);
  const [receitas, setReceitas] = useState<VendaReceitaPendente[]>([]);
  const [antimicrobianos, setAntimicrobianos] = useState<VendaAntimicrobianoRecente[]>([]);
  const [identificacaoComprador, setIdentificacaoComprador] = useState<IdentificacaoCompradorVendedor[]>([]);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [contatos, setContatos] = useState<ContatoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const voltarProsCards = () => {
    setExpandido(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const load = useCallback(async () => {
    if (!profile) return;
    const hoje = new Date();
    const [promocao, cli, prod, rec, antim, ident, met, cont] = await Promise.all([
      repository.getProdutosEmPromocao(profile),
      repository.getClientesDoVendedor(profile),
      repository.getProdutosRecorrentesDoVendedor(profile),
      repository.getVendasComReceita(profile),
      repository.getVendasAntimicrobianoRecente(profile),
      repository.getIdentificacaoCompradorPorVendedor(profile),
      repository.getMetas(profile, hoje.getFullYear(), hoje.getMonth() + 1),
      repository.getContatosRecentes(profile),
    ]);
    setAlertasPromocao(promocao);
    setClientes(cli);
    setProdutosRecorrentes(prod);
    setReceitas(rec);
    setAntimicrobianos(antim);
    setIdentificacaoComprador(ident);
    setMetas(met);
    setContatos(cont);
  }, [profile]);

  // Registra a tentativa de contato e já suprime da lista na hora
  // (otimista) — ver lib/contatos.ts pra janela de cada motivo.
  const registrarContatoAlerta = (
    motivo: MotivoContato,
    codigoCliente: number,
    tipoContato: TipoContato,
    codigoProduto: number | null = null
  ) => {
    if (!profile) return;
    const novo: ContatoCliente = { codigoCliente, motivo, codigoProduto, contatadoEm: new Date().toISOString() };
    setContatos((atual) => [...atual, novo]);
    repository
      .registrarContato({ codigoCliente, motivo, tipoContato, codigoProduto, codigoVendedor: profile.codigoVendedor })
      .catch(() => setContatos((atual) => atual.filter((c) => c !== novo)));
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hoje = new Date();

  const usoContinuoAtrasado = useMemo(
    () =>
      produtosRecorrentes
        .filter((p) => p.atrasado && !foiContatadoRecentemente(contatos, p.codigoCliente, 'uso_continuo', p.codigoProduto))
        .sort((a, b) => b.diasDesdeUltimaCompra - a.diasDesdeUltimaCompra),
    [produtosRecorrentes, contatos]
  );

  const aniversariantes = useMemo(
    () =>
      clientes
        .filter((c) => c.dataNascimento != null)
        .map((c) => ({ cliente: c, dias: diasAteProximoAniversario(c.dataNascimento as string, hoje) }))
        .filter((x) => x.dias <= JANELA_ANIVERSARIO_DIAS && !foiContatadoRecentemente(contatos, x.cliente.codigo, 'aniversario'))
        .sort((a, b) => a.dias - b.dias),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, contatos]
  );

  const diaDoMes = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const percentualMesDecorrido = (diaDoMes / diasNoMes) * 100;
  const metasEmRisco = useMemo(
    () =>
      metas
        .map((m) => ({
          meta: m,
          percentualAtingido: m.valorMetaMensal > 0 ? (m.valorRealizadoMensal / m.valorMetaMensal) * 100 : 0,
        }))
        .filter((x) => x.meta.valorMetaMensal > 0 && x.percentualAtingido < percentualMesDecorrido - 10)
        .sort((a, b) => a.percentualAtingido - b.percentualAtingido),
    [metas, percentualMesDecorrido]
  );

  const receitasPendentesAntigas = useMemo(
    () =>
      receitas
        .filter((r) => !r.receitaAnexada)
        .map((r) => ({ item: r, dias: diasDesde(r.dataVenda, hoje) }))
        .filter((x) => x.dias >= RECEITA_PENDENTE_DIAS)
        .sort((a, b) => b.dias - a.dias),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receitas]
  );

  const clientesAltoValorSumindo = useMemo(() => {
    const comValor = clientes.filter((c) => c.valorTotal > 0).sort((a, b) => b.valorTotal - a.valorTotal);
    const corteTop25 = comValor[Math.floor(comValor.length * 0.25)]?.valorTotal ?? 0;
    return comValor
      .filter(
        (c) =>
          c.valorTotal >= corteTop25 &&
          c.ultimaCompra &&
          diasDesde(c.ultimaCompra, hoje) >= CLIENTE_SUMIU_DIAS &&
          !foiContatadoRecentemente(contatos, c.codigo, 'alto_valor_sumindo')
      )
      .sort((a, b) => b.valorTotal - a.valorTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, contatos]);

  // Mesma lista de alertasPromocao, só tirando quem já foi contatado
  // sobre ESSE produto especificamente — contatar sobre um produto não
  // deve esconder o cliente de outro produto em promoção ao mesmo tempo.
  const alertasPromocaoFiltrados = useMemo(
    () =>
      alertasPromocao.map((alerta) => ({
        ...alerta,
        clientes: alerta.clientes.filter(
          (cliente) => !foiContatadoRecentemente(contatos, cliente.codigoCliente, 'promocao', alerta.produto.codigo)
        ),
      })),
    [alertasPromocao, contatos]
  );

  // Fonte: vw_vendas_antimicrobiano_recente (categoria/grupo do
  // catálogo, não tipo_lista='T' — esse tinha gap de cadastro real,
  // confirmado com dado de produção 03/08/2026: produto duplicado no
  // Trier, a entrada mal cadastrada é a que aparece na venda). Dedupe
  // por (cliente, produto) — se comprou o mesmo antibiótico 2x na
  // janela, mantém só a venda mais recente pra contagem de dias.
  // telefone vem de `clientes` (mesma fonte vendedor-escopada usada
  // por aniversário/alto-valor-sumindo nesta tela); sem telefone, a
  // linha ainda aparece, só sem os botões de contato.
  const antibioticosPorCliente = useMemo(() => {
    const clientesPorCodigo = new Map(clientes.map((c) => [c.codigo, c]));
    const porChave = new Map<
      string,
      { codigoCliente: number; codigoProduto: number; nomeCliente: string; nomeProduto: string; telefone: string | null; dias: number }
    >();
    for (const r of antimicrobianos) {
      if (r.codigoCliente == null) continue;
      const dias = diasDesde(r.dataVenda, hoje);
      if (dias > ANTIBIOTICO_DIAS + ANTIBIOTICO_TOLERANCIA_DIAS) continue;
      const chave = `${r.codigoCliente}:${r.codigoProduto}`;
      const existente = porChave.get(chave);
      if (existente && existente.dias <= dias) continue;
      porChave.set(chave, {
        codigoCliente: r.codigoCliente,
        codigoProduto: r.codigoProduto,
        nomeCliente: r.nomeCliente,
        nomeProduto: r.nomeProduto,
        telefone: clientesPorCodigo.get(r.codigoCliente)?.telefone ?? null,
        dias,
      });
    }
    return Array.from(porChave.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antimicrobianos, clientes]);

  const antibioticosRecentes = useMemo(
    () =>
      antibioticosPorCliente
        .filter(
          (a) => a.dias <= ANTIBIOTICO_DIAS && !existeRegistroContato(contatos, a.codigoCliente, 'antibiotico', a.codigoProduto)
        )
        .sort((a, b) => b.dias - a.dias),
    [antibioticosPorCliente, contatos]
  );

  // Passou a janela sem ninguém ligar/mandar WhatsApp — o efeito
  // abaixo grava 'nao_contatado' sozinho pra cada um destes assim que
  // a tela carrega/atualiza.
  const antibioticosExpirados = useMemo(
    () =>
      antibioticosPorCliente.filter(
        (a) => a.dias > ANTIBIOTICO_DIAS && !existeRegistroContato(contatos, a.codigoCliente, 'antibiotico', a.codigoProduto)
      ),
    [antibioticosPorCliente, contatos]
  );

  // Não existe job/cron rodando isso (diferente do fechamento de
  // comissão, que tem função no banco + cron do n8n) — o "relógio" de
  // 7 dias só é conferido quando alguém abre/atualiza a tela de
  // Alertas. Assim que o contato otimista entra em `contatos`
  // (registrarContatoAlerta), o item some de antibioticosExpirados e o
  // efeito não dispara de novo pra ele.
  useEffect(() => {
    if (!profile || antibioticosExpirados.length === 0) return;
    for (const a of antibioticosExpirados) {
      registrarContatoAlerta('antibiotico', a.codigoCliente, 'nao_contatado', a.codigoProduto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antibioticosExpirados, profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const cards: AlertaCardInfo[] = [
    { chave: 'uso_continuo', emoji: '🔁', titulo: 'Uso contínuo atrasado', contagem: usoContinuoAtrasado.length, cor: '#9333ea' },
    { chave: 'aniversario', emoji: '🎂', titulo: 'Aniversário essa semana', contagem: aniversariantes.length, cor: '#0891b2' },
    { chave: 'meta_risco', emoji: '📉', titulo: 'Meta em risco', contagem: metasEmRisco.length, cor: colors.red },
    { chave: 'receita_pendente', emoji: '💊', titulo: 'Receita pendente há tempo', contagem: receitasPendentesAntigas.length, cor: colors.red },
    {
      chave: 'antibiotico',
      emoji: '🦠',
      titulo: `Antibiótico vendido (${ANTIBIOTICO_DIAS} dias)`,
      contagem: antibioticosRecentes.length,
      cor: '#D97706',
    },
    {
      chave: 'sem_comprador',
      emoji: '🪪',
      titulo: 'Venda controlada sem comprador',
      contagem: identificacaoComprador.reduce((soma, v) => soma + v.vendasSemIdentificacao, 0),
      cor: colors.red,
    },
    { chave: 'alto_valor_sumindo', emoji: '💸', titulo: 'Cliente de alto valor sumindo', contagem: clientesAltoValorSumindo.length, cor: colors.navy },
    { chave: 'promocao', emoji: '🔔', titulo: 'Produto em promoção', contagem: alertasPromocao.length, cor: colors.success },
  ];

  const aoClicarCard = (chave: string) => {
    if (chave === 'uso_continuo') {
      navigation.navigate('MeusClientes', { apenasRecompra: true });
      return;
    }
    if (chave === 'receita_pendente') {
      navigation.navigate('Receitas');
      return;
    }
    setExpandido((atual) => (atual === chave ? null : chave));
  };

  return (
    <View style={styles.wrapper}>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={expandido ? styles.containerContentComFab : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>🔔 Alertas</Text>
      <Text style={styles.subtitle}>Oportunidades de contato e pontos de atenção, atualizados a cada dado novo.</Text>

      <View style={styles.grid}>
        {cards.map((c) => (
          <Pressable
            key={c.chave}
            style={[styles.cardAlerta, expandido === c.chave && styles.cardAlertaAtivo]}
            onPress={() => aoClicarCard(c.chave)}
          >
            <View style={[styles.cardAccent, { backgroundColor: c.cor }]} />
            <View style={styles.cardTextos}>
              <Text style={styles.cardContagem}>{c.contagem}</Text>
              <Text style={styles.cardTitulo}>{c.titulo}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {expandido === 'aniversario' && (
        <Card>
          <Text style={styles.listaTitulo}>Aniversário nos próximos {JANELA_ANIVERSARIO_DIAS} dias</Text>
          {aniversariantes.length === 0 ? (
            <Text style={styles.empty}>Ninguém fazendo aniversário nessa janela.</Text>
          ) : (
            aniversariantes.map(({ cliente, dias }) => (
              <LinhaClienteComHistorico
                key={cliente.codigo}
                codigoCliente={cliente.codigo}
                nome={cliente.nome}
                telefone={cliente.telefone}
                detalhe={dias === 0 ? 'Hoje! 🎉' : dias === 1 ? 'Amanhã' : `Em ${dias} dias`}
                mensagemWhatsapp={`Parabéns, ${nomeCurto(cliente.nome)}! 🎉🎂 A equipe da Farmácia Conviva Parquelândia deseja um feliz aniversário pra você!`}
                onContato={(tipo) => registrarContatoAlerta('aniversario', cliente.codigo, tipo)}
              />
            ))
          )}
        </Card>
      )}

      {expandido === 'meta_risco' && (
        <Card>
          <Text style={styles.listaTitulo}>
            Abaixo do ritmo esperado ({Math.round(percentualMesDecorrido)}% do mês já passou)
          </Text>
          {metasEmRisco.length === 0 ? (
            <Text style={styles.empty}>Ninguém em risco no momento.</Text>
          ) : (
            metasEmRisco.map(({ meta, percentualAtingido }) => (
              <View key={meta.codigoVendedor} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemNome}>{meta.nomeVendedor}</Text>
                  <Text style={styles.itemDetalhe}>
                    {percentualAtingido.toFixed(0)}% da meta · {formatBRL(meta.valorRealizadoMensal)} de{' '}
                    {formatBRL(meta.valorMetaMensal)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>
      )}

      {expandido === 'sem_comprador' && (
        <Card>
          <Text style={styles.listaTitulo}>
            Venda de produto controlado sem identificação real do comprador (desde julho/2026)
          </Text>
          <Text style={styles.listaSubtitulo}>
            Sem cliente na venda, ou cliente cadastrado é o próprio vendedor.
          </Text>
          {identificacaoComprador.filter((v) => v.vendasSemIdentificacao > 0).length === 0 ? (
            <Text style={styles.empty}>Nenhuma pendência — todo mundo identificando o comprador certinho.</Text>
          ) : (
            identificacaoComprador
              .filter((v) => v.vendasSemIdentificacao > 0)
              .map((v) => <LinhaVendedorSemComprador key={v.codigoVendedor} vendedor={v} />)
          )}
        </Card>
      )}

      {expandido === 'alto_valor_sumindo' && (
        <Card>
          <Text style={styles.listaTitulo}>Clientes de alto valor sem comprar há {CLIENTE_SUMIU_DIAS}+ dias</Text>
          {clientesAltoValorSumindo.length === 0 ? (
            <Text style={styles.empty}>Nenhum cliente de alto valor sumiu recentemente.</Text>
          ) : (
            clientesAltoValorSumindo.map((c) => (
              <LinhaClienteComHistorico
                key={c.codigo}
                codigoCliente={c.codigo}
                nome={c.nome}
                telefone={c.telefone}
                detalhe={`${formatBRL(c.valorTotal)} no total${c.ultimaCompra ? ` · última compra em ${formatDateBR(c.ultimaCompra)}` : ''}`}
                mensagemWhatsapp={`Olá, ${nomeCurto(c.nome)}! Aqui é ${nomeCurto(profile?.nome ?? '')} da Farmácia Conviva Parquelândia 💊 Sentimos sua falta — podemos ajudar em algo?`}
                onContato={(tipo) => registrarContatoAlerta('alto_valor_sumindo', c.codigo, tipo)}
              />
            ))
          )}
        </Card>
      )}

      {expandido === 'antibiotico' && (
        <Card>
          <Text style={styles.listaTitulo}>Antibiótico vendido nos últimos {ANTIBIOTICO_DIAS} dias</Text>
          <Text style={styles.listaSubtitulo}>
            Sem contato em {ANTIBIOTICO_DIAS} dias, o item sai da lista e fica registrado como "não contatado".
          </Text>
          {antibioticosRecentes.length === 0 ? (
            <Text style={styles.empty}>Nenhum antibiótico vendido recentemente sem contato.</Text>
          ) : (
            antibioticosRecentes.map((a) => (
              <LinhaClienteComHistorico
                key={`${a.codigoCliente}:${a.codigoProduto}`}
                codigoCliente={a.codigoCliente}
                nome={a.nomeCliente}
                telefone={a.telefone}
                detalhe={`${a.nomeProduto} · ${a.dias === 0 ? 'vendido hoje' : `vendido há ${a.dias} dia${a.dias > 1 ? 's' : ''}`}`}
                mensagemWhatsapp={`Olá, ${nomeCurto(a.nomeCliente)}! Aqui é ${nomeCurto(
                  profile?.nome ?? ''
                )} da Farmácia Conviva Parquelândia 🦠 Notamos que você levou ${a.nomeProduto} há ${a.dias} dia${
                  a.dias > 1 ? 's' : ''
                } — como está indo o tratamento? Qualquer dúvida, é só chamar!`}
                onContato={(tipo) => registrarContatoAlerta('antibiotico', a.codigoCliente, tipo, a.codigoProduto)}
              />
            ))
          )}
        </Card>
      )}

      {expandido === 'promocao' && (
        <>
          {alertasPromocao.length === 0 ? (
            <Card>
              <Text style={styles.empty}>Nenhum produto em promoção no momento.</Text>
            </Card>
          ) : (
            alertasPromocaoFiltrados.map((alerta) => (
              <Card key={alerta.produto.codigo}>
                <View style={styles.headerRow}>
                  <Text style={styles.produtoNome}>{alerta.produto.nome}</Text>
                  <View style={styles.descontoBadge}>
                    <Text style={styles.descontoBadgeText}>-{alerta.produto.percentualDesconto}%</Text>
                  </View>
                </View>

                <View style={styles.precoRow}>
                  {alerta.produto.precoAnterior != null && (
                    <Text style={styles.precoAnterior}>{formatBRL(alerta.produto.precoAnterior)}</Text>
                  )}
                  <Text style={styles.precoAtual}>{formatBRL(alerta.produto.precoAtual)}</Text>
                </View>

                {alerta.clientes.length > 0 && (
                  <View style={styles.clientesSection}>
                    <Text style={styles.clientesTitle}>Já compraram antes ({alerta.clientes.length})</Text>
                    {alerta.clientes.map((cliente) => (
                      <LinhaClienteComHistorico
                        key={cliente.codigoCliente}
                        codigoCliente={cliente.codigoCliente}
                        nome={cliente.nomeCliente}
                        telefone={cliente.telefone}
                        detalhe={`Última vez em ${formatDateBR(cliente.ultimaCompraProduto)}`}
                        mensagemWhatsapp={mensagemPromocao(alerta, cliente.nomeCliente, cliente.ultimaCompraProduto)}
                        onContato={(tipo) => registrarContatoAlerta('promocao', cliente.codigoCliente, tipo, alerta.produto.codigo)}
                      />
                    ))}
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
      {expandido && (
        <Pressable style={styles.fab} onPress={voltarProsCards}>
          <Ionicons name="arrow-up" size={18} color={colors.white} />
          <Text style={styles.fabTexto}>Cards</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  containerContentComFab: { paddingBottom: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  fabTexto: { color: colors.white, fontWeight: '700', fontSize: 13 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cardAlerta: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardAlertaAtivo: { borderWidth: 1.5, borderColor: colors.navy },
  cardAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 10 },
  cardTextos: { flexShrink: 1 },
  cardContagem: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  cardTitulo: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  listaTitulo: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  listaSubtitulo: { fontSize: 11, color: colors.textMuted, marginBottom: 10 },
  percentualDestaque: { fontSize: 16, fontWeight: '700', color: colors.red },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  itemInfo: { flexShrink: 1 },
  itemNome: { fontSize: 14, color: colors.textPrimary, fontWeight: '500' },
  itemDetalhe: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  itemAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historicoPainel: {
    paddingLeft: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historicoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    gap: 8,
  },
  historicoProduto: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  historicoMotivo: { fontSize: 11, color: colors.red, marginTop: 1 },
  historicoData: { fontSize: 12, color: colors.textSecondary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  produtoNome: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, flexShrink: 1, marginRight: 8 },
  descontoBadge: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  descontoBadgeText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  precoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 4 },
  precoAnterior: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through' },
  precoAtual: { fontSize: 18, fontWeight: '700', color: colors.success },
  clientesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clientesTitle: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
});
