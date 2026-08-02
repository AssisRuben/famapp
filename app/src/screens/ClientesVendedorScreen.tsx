import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { ClienteDoVendedor, HistoricoCompraCliente, ProdutoRecorrenteCliente } from '../types/domain';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR } from '../lib/format';

// Grupos curados da tela "Meus clientes" — produto_catalogo.grupo tem
// ~25 valores reais da Trier, a maioria irrelevante pra resgate
// (CHOCOLATE, REFRIGERANTES, BONIFICACAO...). Fica só o que interessa,
// mesclando as variantes (GENERICO/GENERICO ANTIMICROBIANOS/GENERICO
// CONTROLADOS/GENERICO ONEROSO viram um "Genérico" só, mesma lógica
// pra Similar/Ético; FRALDAS e PRODUTOS INFANTIS viram um filtro só,
// pedido explícito de 01/08/2026).
interface GrupoFiltro {
  chave: string;
  label: string;
  bate: (grupo: string | null) => boolean;
}

const GRUPOS_FILTRO: GrupoFiltro[] = [
  { chave: 'generico', label: 'Genérico', bate: (g) => !!g && g.trim().toUpperCase().startsWith('GENERICO') },
  { chave: 'similar', label: 'Similar', bate: (g) => !!g && g.trim().toUpperCase().startsWith('SIMILAR') },
  { chave: 'etico', label: 'Ético', bate: (g) => !!g && g.trim().toUpperCase().startsWith('ETICO') },
  {
    chave: 'fralda_infantil',
    label: 'Fraldas / Infantil',
    bate: (g) => !!g && ['FRALDAS', 'PRODUTOS INFANTIS'].includes(g.trim().toUpperCase()),
  },
  { chave: 'orelhinha', label: 'Orelhinha', bate: (g) => !!g && g.trim().toUpperCase() === 'ORELHINHA' },
];

// Substituiu a aba "Ranking" (01/08/2026) — o ranking virou parte do
// Painel (card "🏆 Ranking"), e essa aba passou a mostrar a carteira
// de clientes do próprio vendedor: quem ele já atendeu, com busca por
// nome de cliente, busca por nome de produto, seletor de grupo e
// filtro de "uso contínuo" (recompra atrasada — o sinal mais forte
// pra lista de resgate). Clicar num cliente expande as últimas 5
// compras (produto + data) do histórico completo dele (qualquer
// vendedor que atendeu, pra dar contexto).
export function ClientesVendedorScreen() {
  const { profile } = useAuth();
  const route = useRoute<any>();
  const [clientes, setClientes] = useState<ClienteDoVendedor[]>([]);
  const [produtos, setProdutos] = useState<ProdutoRecorrenteCliente[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroNomeProduto, setFiltroNomeProduto] = useState('');
  const [grupoSelecionado, setGrupoSelecionado] = useState<string | null>(null);
  const [menuGrupoAberto, setMenuGrupoAberto] = useState(false);
  const [apenasRecompra, setApenasRecompra] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [historico, setHistorico] = useState<HistoricoCompraCliente[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const [c, p] = await Promise.all([
      repository.getClientesDoVendedor(profile),
      repository.getProdutosRecorrentesDoVendedor(profile),
    ]);
    setClientes(c);
    setProdutos(p);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Deep-link do card "Uso contínuo atrasado" da aba Alertas
  // (navigation.navigate('MeusClientes', { apenasRecompra: true })) —
  // como é aba, não tela empilhada, o componente já pode estar
  // montado; sem esse efeito, navegar de novo com o param não muda o
  // filtro que já estava aplicado antes.
  useEffect(() => {
    if (route.params?.apenasRecompra) {
      setApenasRecompra(true);
    }
  }, [route.params]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const alternarExpandido = async (codigo: number) => {
    if (expandido === codigo) {
      setExpandido(null);
      return;
    }
    setExpandido(codigo);
    setHistorico([]);
    if (!profile) return;
    setCarregandoHistorico(true);
    try {
      setHistorico(await repository.getHistoricoComprasCliente(profile, codigo));
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const grupoAtivo = GRUPOS_FILTRO.find((g) => g.chave === grupoSelecionado) ?? null;

  // Produtos agrupados por cliente, já filtrados por nome de produto
  // e/ou grupo (quando ativos) — usado tanto pra decidir quem aparece
  // na lista quanto pra mostrar o "motivo" do resgate embaixo do card.
  const produtosPorCliente = useMemo(() => {
    const nomeNormalizado = filtroNomeProduto.trim().toLowerCase();
    const mapa = new Map<number, ProdutoRecorrenteCliente[]>();
    for (const p of produtos) {
      if (apenasRecompra && !p.atrasado) continue;
      if (nomeNormalizado && !p.nomeProduto.toLowerCase().includes(nomeNormalizado)) continue;
      if (grupoAtivo && !grupoAtivo.bate(p.grupo)) continue;
      const lista = mapa.get(p.codigoCliente) ?? [];
      lista.push(p);
      mapa.set(p.codigoCliente, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => b.diasDesdeUltimaCompra - a.diasDesdeUltimaCompra);
    }
    return mapa;
  }, [produtos, filtroNomeProduto, grupoAtivo, apenasRecompra]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const filtroProdutoAtivo = filtroNomeProduto.trim().length > 0 || grupoAtivo != null || apenasRecompra;
  const clientesFiltrados = clientes.filter((c) => {
    if (buscaNormalizada && !c.nome.toLowerCase().includes(buscaNormalizada)) return false;
    if (filtroProdutoAtivo && !produtosPorCliente.has(c.codigo)) return false;
    return true;
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meus clientes</Text>
      <Text style={styles.subtitle}>{clientes.length} cliente(s) atendido(s) por você</Text>

      <View style={styles.buscaWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.buscaInput}
          placeholder="Buscar cliente pelo nome"
          placeholderTextColor={colors.textMuted}
          value={busca}
          onChangeText={setBusca}
          autoCapitalize="none"
        />
        {busca.length > 0 && (
          <Pressable onPress={() => setBusca('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.buscaWrap}>
        <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.buscaInput}
          placeholder="Buscar pelo nome do produto"
          placeholderTextColor={colors.textMuted}
          value={filtroNomeProduto}
          onChangeText={setFiltroNomeProduto}
          autoCapitalize="none"
        />
        {filtroNomeProduto.length > 0 && (
          <Pressable onPress={() => setFiltroNomeProduto('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.filtrosRow}>
        <Pressable
          style={[styles.chip, grupoAtivo && styles.chipAtivo]}
          onPress={() => setMenuGrupoAberto(true)}
        >
          <Ionicons name="albums-outline" size={14} color={grupoAtivo ? colors.white : colors.navy} />
          <Text style={[styles.chipTexto, grupoAtivo && styles.chipTextoAtivo]}>
            {grupoAtivo ? grupoAtivo.label : 'Grupo'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={grupoAtivo ? colors.white : colors.navy} />
        </Pressable>

        <Pressable
          style={[styles.chip, apenasRecompra && styles.chipAtivo]}
          onPress={() => setApenasRecompra((v) => !v)}
        >
          <Ionicons name="refresh" size={14} color={apenasRecompra ? colors.white : colors.navy} />
          <Text style={[styles.chipTexto, apenasRecompra && styles.chipTextoAtivo]}>Uso contínuo</Text>
        </Pressable>
      </View>

      <Modal visible={menuGrupoAberto} transparent animationType="fade" onRequestClose={() => setMenuGrupoAberto(false)}>
        <Pressable style={styles.menuFundo} onPress={() => setMenuGrupoAberto(false)}>
          <View style={styles.menuFlutuante}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setGrupoSelecionado(null);
                setMenuGrupoAberto(false);
              }}
            >
              <Text style={[styles.menuItemTexto, !grupoSelecionado && styles.menuItemTextoAtivo]}>Todos os grupos</Text>
              {!grupoSelecionado && <Ionicons name="checkmark" size={16} color={colors.navy} />}
            </Pressable>
            {GRUPOS_FILTRO.map((g) => (
              <Pressable
                key={g.chave}
                style={styles.menuItem}
                onPress={() => {
                  setGrupoSelecionado((atual) => (atual === g.chave ? null : g.chave));
                  setMenuGrupoAberto(false);
                }}
              >
                <Text style={[styles.menuItemTexto, grupoSelecionado === g.chave && styles.menuItemTextoAtivo]}>
                  {g.label}
                </Text>
                {grupoSelecionado === g.chave && <Ionicons name="checkmark" size={16} color={colors.navy} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <FlatList
        data={clientesFiltrados}
        keyExtractor={(item) => String(item.codigo)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {buscaNormalizada || filtroProdutoAtivo
              ? 'Nenhum cliente encontrado com esse filtro.'
              : 'Você ainda não tem venda registrada.'}
          </Text>
        }
        renderItem={({ item }) => {
          const aberto = expandido === item.codigo;
          const produtosDoCliente = produtosPorCliente.get(item.codigo);
          return (
            <View style={styles.card}>
              <Pressable style={styles.row} onPress={() => alternarExpandido(item.codigo)}>
                <View style={styles.info}>
                  <Text style={styles.nome}>{item.nome}</Text>
                  {item.telefone ? <Text style={styles.detalhe}>📞 {item.telefone}</Text> : null}
                  {item.email ? <Text style={styles.detalhe}>✉️ {item.email}</Text> : null}
                  {item.dataNascimento ? <Text style={styles.detalhe}>🎂 {formatDateBR(item.dataNascimento)}</Text> : null}
                  <Text style={styles.detalheDestaque}>
                    {formatBRL(item.valorTotal)}
                    {item.ultimaCompra ? ` · última compra em ${formatDateBR(item.ultimaCompra)}` : ''}
                  </Text>
                  {filtroProdutoAtivo && produtosDoCliente
                    ? produtosDoCliente
                        .filter((p) => p.recorrente)
                        .slice(0, 2)
                        .map((p) => (
                          <Text key={p.codigoProduto} style={styles.usoContinuoLinha}>
                            🔁{' '}
                            <Text style={[styles.usoContinuoNome, p.atrasado && styles.usoContinuoNomeAtrasado]}>
                              {p.nomeProduto}
                            </Text>
                            {' '}· a cada ~{Math.round(p.intervaloMedioDias ?? 0)}d, já são {p.diasDesdeUltimaCompra}d
                          </Text>
                        ))
                    : null}
                </View>
                <View style={styles.acoes}>
                  {item.telefone ? (
                    <WhatsAppButton
                      compact
                      telefone={item.telefone}
                      mensagem={`Olá, ${item.nome}! Aqui é ${profile?.nome ?? ''} da Farmácias Conviva 💊 Tudo bem?`}
                    />
                  ) : null}
                  <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </View>
              </Pressable>

              {aberto && (
                <View style={styles.painel}>
                  <Text style={styles.historicoTitulo}>Últimas compras</Text>
                  {carregandoHistorico ? (
                    <ActivityIndicator style={{ marginTop: 8 }} />
                  ) : historico.length === 0 ? (
                    <Text style={styles.detalhe}>Sem histórico de compra encontrado.</Text>
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
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  buscaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 8,
  },
  buscaInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  chipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTexto: { fontSize: 12, fontWeight: '600', color: colors.navy },
  chipTextoAtivo: { color: colors.white },
  menuFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'flex-start' },
  menuFlutuante: {
    marginTop: 190,
    marginLeft: 16,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuItemTexto: { fontSize: 14, color: colors.textPrimary },
  menuItemTextoAtivo: { color: colors.navy, fontWeight: '700' },
  list: { paddingBottom: 24 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  info: { flexShrink: 1, flex: 1 },
  nome: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  detalhe: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  detalheDestaque: { fontSize: 12, color: colors.textPrimary, fontWeight: '600', marginTop: 4 },
  usoContinuoLinha: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
  usoContinuoNome: { fontWeight: '700', color: '#9333ea' },
  usoContinuoNomeAtrasado: { color: colors.red },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  painel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: 14,
    gap: 4,
  },
  historicoTitulo: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  historicoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  historicoProduto: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  historicoData: { fontSize: 12, color: colors.textSecondary },
});
