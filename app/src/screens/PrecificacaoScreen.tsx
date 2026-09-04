import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  ListRenderItemInfo,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { LoadingFarmacia } from '../components/LoadingFarmacia';
import { colors } from '../theme/colors';
import { formatBRL, parseDecimalBR, todayISO } from '../lib/format';
import { LIMIAR_DIAS_PARADO } from '../lib/precificacao';
import { calcularMargemPct } from '../lib/campanhas';
import { gerarCsvPrecificacao } from '../lib/precificacaoCsv';
import { gerarTxtTrier } from '../lib/trierTxt';
import { baixarArquivoTextoNoWeb } from '../lib/downloadWeb';
import { alertar, confirmar } from '../lib/alert';
import { aplicarMascaraMoeda } from '../lib/moeda';
import {
  labelGrupoCompleto,
  MACRO_GRUPO_LABEL,
  MacroGrupo,
  ORDEM_MACRO_GRUPOS,
  macroGrupoDoProduto,
} from '../lib/macroGrupo';
import { CampanhaProduto, ItemPrecificacao, TagPrecificacao } from '../types/domain';

const TAG_INFO: Record<TagPrecificacao, { label: string; cor: string }> = {
  candidato_reajuste: { label: '🔼 Candidato a reajuste', cor: colors.success },
  parado_avaliar_preco: { label: '🐌 Parado — avaliar preço', cor: colors.red },
  baixa_elasticidade: { label: '🔒 Baixa elasticidade', cor: colors.navy },
  alta_elasticidade: { label: '🎯 Alta elasticidade', cor: '#9333ea' },
};

type Filtro = 'sinais' | 'candidato_reajuste' | 'parado_avaliar_preco' | 'baixa_elasticidade' | 'alta_elasticidade';
const TODOS_MACRO_GRUPOS = '__todos_macro__';
const TODOS_GRUPOS_RAW = '__todos_raw__';

// Reajuste de preço não é uma promoção com validade — mas o único
// layout de .txt que a Trier aceita hoje (ver lib/trierTxt.ts) exige
// início/fim. Usa uma janela bem longa pra simular "preço permanente"
// até confirmar com a Trier se existe um layout dedicado a reajuste.
const HORIZONTE_REAJUSTE_DIAS = 365 * 5;

function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Mesmo critério de busca usado em Produto em Falta: só casa início de
// palavra (evita "dip" achando "aDIPept" no meio do nome).
function casaBusca(nome: string, termo: string): boolean {
  if (!termo) return true;
  return nome.toLowerCase().split(/\s+/).some((palavra) => palavra.startsWith(termo));
}

// null = sem edição válida (campo vazio, não numérico, ou igual ao
// preço atual) — nesses casos o produto NÃO entra no .txt de reajuste,
// só quem teve o preço de fato alterado aqui na tela.
function precoAlterado(precoAtual: number, digitado: string | undefined): number | null {
  if (digitado === undefined || digitado.trim() === '') return null;
  // parseDecimalBR, não Number(texto.replace(',', '.')) — esse último
  // quebra a partir de R$1.000 (o ponto de milhar da máscara vira um
  // segundo ponto decimal, Number() dá NaN) — achado 26/08/2026, mesmo
  // bug em Metas/Campanhas/Venda Adicional.
  const numero = parseDecimalBR(digitado);
  if (numero <= 0) return null;
  return numero.toFixed(2) === precoAtual.toFixed(2) ? null : numero;
}

// Diferente de precoAlterado: aqui um valor igual ao preço atual
// continua "válido" (só serve pra recalcular a margem exibida em
// tempo real enquanto digita, não pra decidir quem entra no .txt).
function parsePrecoDigitado(digitado: string | undefined): number | null {
  if (digitado === undefined || digitado.trim() === '') return null;
  const numero = parseDecimalBR(digitado);
  return numero > 0 ? numero : null;
}

function TagBadge({ tag }: { tag: TagPrecificacao }) {
  const info = TAG_INFO[tag];
  return (
    <View style={[styles.badge, { backgroundColor: info.cor }]}>
      <Text style={styles.badgeTexto}>{info.label}</Text>
    </View>
  );
}

export function PrecificacaoScreen() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<ItemPrecificacao[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('sinais');
  const [filtroMacroGrupo, setFiltroMacroGrupo] = useState<MacroGrupo | typeof TODOS_MACRO_GRUPOS>(TODOS_MACRO_GRUPOS);
  const [filtroGrupoRaw, setFiltroGrupoRaw] = useState(TODOS_GRUPOS_RAW);
  const [buscaNome, setBuscaNome] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportandoTxt, setExportandoTxt] = useState(false);
  const [novoPreco, setNovoPreco] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    setItens(await repository.getRelatorioPrecificacao(profile));
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const macroGruposDisponiveis = useMemo(() => {
    const presentes = new Set(
      itens.map((i) => macroGrupoDoProduto(i.produto.grupo)).filter((m): m is MacroGrupo => m !== null)
    );
    return ORDEM_MACRO_GRUPOS.filter((m) => presentes.has(m));
  }, [itens]);

  // Segunda camada: só faz sentido depois de escolher um macro-grupo —
  // mostra os grupos brutos originais que caem dentro dele, pra quem
  // quiser afinar além da macro-categoria.
  const gruposRawDisponiveis = useMemo(() => {
    if (filtroMacroGrupo === TODOS_MACRO_GRUPOS) return [];
    const grupos = new Set(
      itens
        .filter((i) => macroGrupoDoProduto(i.produto.grupo) === filtroMacroGrupo)
        .map((i) => i.produto.grupo?.trim())
        .filter((g): g is string => !!g)
    );
    return Array.from(grupos).sort((a, b) => a.localeCompare(b));
  }, [itens, filtroMacroGrupo]);

  const selecionarMacroGrupo = (macro: MacroGrupo | typeof TODOS_MACRO_GRUPOS) => {
    setFiltroMacroGrupo(macro);
    setFiltroGrupoRaw(TODOS_GRUPOS_RAW);
  };

  const estoqueParado = useMemo(() => {
    const produtosParados = itens.filter((i) => i.tags.includes('parado_avaliar_preco'));
    const valor = produtosParados.reduce((acc, i) => acc + i.produto.custoMedio * i.produto.estoqueAtual, 0);
    return { quantidade: produtosParados.length, valor };
  }, [itens]);

  const produtosAlterados = useMemo(() => {
    return itens.flatMap((item) => {
      const novoValor = precoAlterado(item.produto.precoVenda, novoPreco[item.produto.codigo]);
      return novoValor === null ? [] : [{ item, novoValor }];
    });
  }, [itens, novoPreco]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingFarmacia />
      </View>
    );
  }

  const acionaveis = itens.filter(
    (i) => i.tags.includes('candidato_reajuste') || i.tags.includes('parado_avaliar_preco')
  );
  const porSinal = filtro === 'sinais' ? acionaveis : itens.filter((i) => i.tags.includes(filtro));
  const porMacroGrupo =
    filtroMacroGrupo === TODOS_MACRO_GRUPOS
      ? porSinal
      : porSinal.filter((i) => macroGrupoDoProduto(i.produto.grupo) === filtroMacroGrupo);
  const porGrupoRaw =
    filtroGrupoRaw === TODOS_GRUPOS_RAW
      ? porMacroGrupo
      : porMacroGrupo.filter((i) => (i.produto.grupo ?? '').trim() === filtroGrupoRaw);
  const termoBusca = buscaNome.trim().toLowerCase();
  const visiveis = porGrupoRaw.filter((i) => casaBusca(i.produto.nome, termoBusca));

  const exportarCsv = async () => {
    if (visiveis.length === 0) return;
    setExportando(true);
    try {
      const conteudo = gerarCsvPrecificacao(visiveis);
      const nomeArquivo = `precificacao-${todayISO()}.csv`;

      if (Platform.OS === 'web') {
        baixarArquivoTextoNoWeb(nomeArquivo, conteudo);
        return;
      }

      const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
      await FileSystem.writeAsStringAsync(uri, conteudo);

      const podeCompartilhar = await Sharing.isAvailableAsync();
      if (podeCompartilhar) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Exportar relatório de precificação' });
      } else {
        alertar('Arquivo gerado', `Salvo em: ${uri}`);
      }
    } catch (erro) {
      alertar('Erro ao exportar CSV', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const ajustarNovoPreco = (codigoProduto: number, texto: string) => {
    setNovoPreco((atual) => ({ ...atual, [codigoProduto]: aplicarMascaraMoeda(texto) }));
  };

  const exportarTxtReajuste = () => {
    if (produtosAlterados.length === 0) {
      alertar('Nenhum preço alterado', 'Edite o "Novo preço" de pelo menos um produto antes de gerar o .txt.');
      return;
    }
    confirmar(
      'Gerar .txt de reajuste',
      `Isso gera um arquivo pra importar no Trier com o novo preço de ${produtosAlterados.length} produto(s) que você alterou aqui. Valide num ambiente de homologação antes de usar em produção. Continuar?`,
      async () => {
        setExportandoTxt(true);
        try {
          const produtos: CampanhaProduto[] = produtosAlterados.map(({ item, novoValor }) => ({
            codigoProduto: item.produto.codigo,
            codigoBarras: item.produto.codigoBarras,
            nomeProduto: item.produto.nome,
            precoRegular: item.produto.precoVenda,
            custoMedio: item.produto.custoMedio,
            precoPromocional: novoValor,
            percentualDesconto: 0,
            quantidadeCartazes: 0,
            dataInicio: todayISO(),
            dataFim: somarDias(todayISO(), HORIZONTE_REAJUSTE_DIAS),
            tipoPromocao: 'unitario',
            kit: null,
          }));
          const conteudo = gerarTxtTrier(produtos);
          const nomeArquivo = `reajuste-precos-${todayISO()}.txt`;

          if (Platform.OS === 'web') {
            baixarArquivoTextoNoWeb(nomeArquivo, conteudo);
            return;
          }

          const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
          await FileSystem.writeAsStringAsync(uri, conteudo);

          const podeCompartilhar = await Sharing.isAvailableAsync();
          if (podeCompartilhar) {
            await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'Exportar .txt de reajuste' });
          } else {
            alertar('Arquivo gerado', `Salvo em: ${uri}`);
          }
        } catch (erro) {
          alertar('Erro ao gerar .txt', erro instanceof Error ? erro.message : 'Tente novamente.');
        } finally {
          setExportandoTxt(false);
        }
      },
      { textoConfirmar: 'Gerar arquivo' }
    );
  };

  const renderItem = ({ item }: ListRenderItemInfo<ItemPrecificacao>) => {
    // Margem exibida acompanha o "Novo preço" em tempo real enquanto o
    // gestor digita (preview de antes de gerar o .txt) — sem edição
    // válida, cai de volta pra margem atual calculada no carregamento.
    const precoDigitado = parsePrecoDigitado(novoPreco[item.produto.codigo]);
    const margemExibida =
      precoDigitado != null ? calcularMargemPct(precoDigitado, item.produto.custoMedio) : item.margemAtualPct;

    return (
      <Card style={styles.cardCompacta}>
        <Text style={styles.itemNome} numberOfLines={1}>{item.produto.nome}</Text>
        <Text style={styles.itemCategoria}>{labelGrupoCompleto(item.produto.grupo)}</Text>

        {item.tags.length > 0 && (
          <View style={styles.badgesRow}>
            {item.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </View>
        )}

        <View style={styles.detalhesGrid}>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Giro (30d)</Text>
            <Text style={styles.detalheValor}>{item.quantidadeVendida30d} un.</Text>
          </View>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Dias parado</Text>
            <Text style={styles.detalheValor}>{item.diasSemVenda ?? '—'}</Text>
          </View>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Margem</Text>
            <Text style={[styles.detalheValor, precoDigitado != null && styles.detalheValorPrevisto]}>
              {margemExibida.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Compra</Text>
            <Text style={styles.detalheValor}>{formatBRL(item.produto.custoMedio)}</Text>
          </View>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Venda</Text>
            <Text style={styles.detalheValor}>{formatBRL(item.produto.precoVenda)}</Text>
          </View>
          <View style={styles.detalheItem}>
            <Text style={styles.detalheLabel}>Estoque</Text>
            <Text style={styles.detalheValor}>{item.produto.estoqueAtual} un.</Text>
          </View>
        </View>

        <View style={styles.novoPrecoRow}>
          <Text style={styles.itemLabel}>Novo preço</Text>
          <TextInput
            style={styles.inputNovoPreco}
            keyboardType="numeric"
            placeholder={item.produto.precoVenda.toFixed(2).replace('.', ',')}
            placeholderTextColor={colors.textMuted}
            value={novoPreco[item.produto.codigo] ?? ''}
            onChangeText={(texto) => ajustarNovoPreco(item.produto.codigo, texto)}
          />
        </View>
      </Card>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      data={visiveis}
      keyExtractor={(item) => String(item.produto.codigo)}
      renderItem={renderItem}
      initialNumToRender={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS !== 'web'}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>📊 Sinais de precificação</Text>
          <Text style={styles.subtitle}>
            Diagnóstico, não decisão: aponta quem merece atenção com base em giro, margem e categoria — o desconto em
            si continua sendo definido na aba Campanhas.
          </Text>

          {estoqueParado.quantidade > 0 && (
            <Card style={styles.cardEstoqueParado} onPress={() => setFiltro('parado_avaliar_preco')}>
              <Text style={styles.tituloEstoqueParado}>📦 Estoque parado</Text>
              <Text style={styles.valorEstoqueParado}>{formatBRL(estoqueParado.valor)}</Text>
              <Text style={styles.subEstoqueParado}>
                {estoqueParado.quantidade} produto(s) sem venda há {LIMIAR_DIAS_PARADO}+ dias, ainda em estoque —
                capital parado, candidato a promoção ou reajuste. Toque pra filtrar.
              </Text>
            </Card>
          )}

          <Card>
            <Text style={styles.explicacaoParametro}>
              <Text style={styles.explicacaoDestaque}>🐌 Parado: </Text>
              {LIMIAR_DIAS_PARADO} dias ou mais sem venda, mas ainda COM estoque disponível — se faltasse produto o
              problema seria reposição (aba Compras), não preço.
            </Text>
            <Text style={styles.explicacaoParametro}>
              <Text style={styles.explicacaoDestaque}>Elasticidade: </Text>
              não é uma ação, é contexto pra calibrar o quanto testar de variação de preço. 🔒 Baixa elasticidade
              (Éticos/Genéricos/Similares) = uso contínuo/prescrição, cliente tolera menos mudança de preço. 🎯 Alta
              elasticidade = o resto do catálogo, mais perto de conveniência/impulso, reage mais a mudança de preço.
            </Text>
          </Card>

          <TextInput
            style={styles.inputBusca}
            placeholder="Buscar produto por nome"
            placeholderTextColor={colors.textMuted}
            value={buscaNome}
            onChangeText={setBuscaNome}
          />

          <View style={styles.filtroRow}>
            {(
              [
                { chave: 'sinais', label: 'Todos os sinais' },
                { chave: 'candidato_reajuste', label: '🔼 Reajuste' },
                { chave: 'parado_avaliar_preco', label: '🐌 Parado' },
                { chave: 'baixa_elasticidade', label: '🔒 Baixa elasticidade' },
                { chave: 'alta_elasticidade', label: '🎯 Alta elasticidade' },
              ] as { chave: Filtro; label: string }[]
            ).map((opcao) => (
              <Pressable
                key={opcao.chave}
                style={[styles.filtroChip, filtro === opcao.chave && styles.filtroChipAtivo]}
                onPress={() => setFiltro(opcao.chave)}
              >
                <Text style={[styles.filtroChipTexto, filtro === opcao.chave && styles.filtroChipTextoAtivo]}>
                  {opcao.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {macroGruposDisponiveis.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroGrupoScroll}>
              <View style={styles.filtroRow}>
                <Pressable
                  style={[styles.filtroChip, filtroMacroGrupo === TODOS_MACRO_GRUPOS && styles.filtroChipAtivo]}
                  onPress={() => selecionarMacroGrupo(TODOS_MACRO_GRUPOS)}
                >
                  <Text
                    style={[
                      styles.filtroChipTexto,
                      filtroMacroGrupo === TODOS_MACRO_GRUPOS && styles.filtroChipTextoAtivo,
                    ]}
                  >
                    Todos os grupos
                  </Text>
                </Pressable>
                {macroGruposDisponiveis.map((macro) => (
                  <Pressable
                    key={macro}
                    style={[styles.filtroChip, filtroMacroGrupo === macro && styles.filtroChipAtivo]}
                    onPress={() => selecionarMacroGrupo(macro)}
                  >
                    <Text style={[styles.filtroChipTexto, filtroMacroGrupo === macro && styles.filtroChipTextoAtivo]}>
                      {MACRO_GRUPO_LABEL[macro]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {gruposRawDisponiveis.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroGrupoScroll}>
              <View style={styles.filtroRow}>
                <Pressable
                  style={[styles.filtroChipSecundario, filtroGrupoRaw === TODOS_GRUPOS_RAW && styles.filtroChipAtivo]}
                  onPress={() => setFiltroGrupoRaw(TODOS_GRUPOS_RAW)}
                >
                  <Text
                    style={[
                      styles.filtroChipTexto,
                      filtroGrupoRaw === TODOS_GRUPOS_RAW && styles.filtroChipTextoAtivo,
                    ]}
                  >
                    Todos dessa categoria
                  </Text>
                </Pressable>
                {gruposRawDisponiveis.map((grupo) => (
                  <Pressable
                    key={grupo}
                    style={[styles.filtroChipSecundario, filtroGrupoRaw === grupo && styles.filtroChipAtivo]}
                    onPress={() => setFiltroGrupoRaw(grupo)}
                  >
                    <Text style={[styles.filtroChipTexto, filtroGrupoRaw === grupo && styles.filtroChipTextoAtivo]}>
                      {grupo}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {visiveis.length > 0 && (
            <>
              <Pressable style={styles.botaoSecundario} onPress={exportarCsv} disabled={exportando}>
                {exportando ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                    <Text style={styles.botaoSecundarioTexto}>Exportar Excel ({visiveis.length})</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.botaoSecundario}
                onPress={exportarTxtReajuste}
                disabled={exportandoTxt || produtosAlterados.length === 0}
              >
                {exportandoTxt ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.navy} />
                    <Text style={styles.botaoSecundarioTexto}>
                      Gerar .txt de reajuste pra Trier ({produtosAlterados.length})
                    </Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.aviso}>
                Edite o "Novo preço" nos produtos que quiser reajustar — só quem tiver o preço alterado aqui entra no
                .txt (pode ser de fora do filtro/busca atual).
              </Text>
            </>
          )}
        </>
      }
      ListEmptyComponent={
        <Card>
          <Text style={styles.empty}>Nenhum produto com esse sinal no momento.</Text>
        </Card>
      }
    />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  cardEstoqueParado: { backgroundColor: colors.navy },
  tituloEstoqueParado: { fontSize: 13, fontWeight: '700', color: colors.white, opacity: 0.85 },
  valorEstoqueParado: { fontSize: 26, fontWeight: '800', color: colors.white, marginTop: 4 },
  subEstoqueParado: { fontSize: 12, color: colors.white, opacity: 0.85, marginTop: 6, lineHeight: 16 },
  explicacaoParametro: { fontSize: 11, color: colors.textMuted, lineHeight: 15, marginBottom: 6 },
  explicacaoDestaque: { fontWeight: '700', color: colors.textSecondary },
  inputBusca: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
  },
  filtroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filtroGrupoScroll: { marginBottom: 2 },
  filtroChipSecundario: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botaoSecundario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  botaoSecundarioTexto: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  filtroChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtroChipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroChipTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  filtroChipTextoAtivo: { color: colors.white },
  cardCompacta: { padding: 14, marginBottom: 10 },
  itemNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  itemCategoria: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeTexto: { color: colors.white, fontSize: 11, fontWeight: '700' },
  detalhesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detalheItem: { width: '33.33%', marginBottom: 8 },
  detalheLabel: { fontSize: 11, color: colors.textSecondary },
  detalheValor: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 1 },
  detalheValorPrevisto: { color: colors.navy },
  novoPrecoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemLabel: { fontSize: 12, color: colors.textSecondary },
  inputNovoPreco: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
    width: 90,
    textAlign: 'right',
  },
  aviso: { fontSize: 11, color: colors.textMuted, marginBottom: 10, lineHeight: 15 },
});
