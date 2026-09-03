import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { CalendarioPeriodo } from '../components/CalendarioPeriodo';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR, formatDecimalBR, parseDecimalBR, todayISO } from '../lib/format';
import { alertar } from '../lib/alert';
import { MACRO_GRUPO_LABEL, MacroGrupo, ORDEM_MACRO_GRUPOS } from '../lib/macroGrupo';
import { resolverCodigosSeed } from '../lib/afinidadeKits';
import { calcularKitPercentualSustentavel, calcularKitPrecoFixoSustentavel, descricaoKitMultiProduto } from '../lib/kits';
import { KitMultiProduto, ProdutoCatalogo, SugestaoParAfinidade, TipoPrecificacaoKit } from '../types/domain';

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Sugestão de par + edição antes de virar KitMultiProduto de verdade —
// mesmo espírito de CampanhaProduto em CampanhasScreen (a sugestão
// "crua" já vem com um preço calculado, mas o gestor pode mexer antes
// de salvar).
interface ItemSugerido extends SugestaoParAfinidade {
  chave: string;
  selecionado: boolean;
  tipoPrecificacao: TipoPrecificacaoKit;
  percentualDescontoItem: number;
  precoFixo: number;
}

function totalRegularDoPar(item: SugestaoParAfinidade): number {
  return item.precoRegularSeed + item.precoRegularParceiro;
}

function produtosParaCalculo(item: SugestaoParAfinidade) {
  return [
    { precoVenda: item.precoRegularSeed, custoMedio: item.custoMedioSeed, quantidade: 1 },
    { precoVenda: item.precoRegularParceiro, custoMedio: item.custoMedioParceiro, quantidade: 1 },
  ];
}

// Único lugar que monta um KitMultiProduto a partir de um par
// sugerido/editado — usado tanto na prévia (texto ao vivo) quanto no
// salvar(), pra não ter duas montagens que podem divergir silenciosamente.
function itemParaKit(item: ItemSugerido, dataInicio: string, dataFim: string): KitMultiProduto {
  return {
    id: '',
    nome: null,
    tipoPrecificacao: item.tipoPrecificacao,
    percentualDescontoItem: item.tipoPrecificacao === 'percentual' ? item.percentualDescontoItem : null,
    precoFixo: item.tipoPrecificacao === 'preco_fixo' ? item.precoFixo : null,
    quantidadeCartazes: 1,
    dataInicio,
    dataFim,
    produtos: [
      {
        codigoProduto: item.codigoProdutoSeed,
        nomeProduto: item.nomeProdutoSeed,
        quantidade: 1,
        precoRegular: item.precoRegularSeed,
        custoMedio: item.custoMedioSeed,
      },
      {
        codigoProduto: item.codigoProdutoParceiro,
        nomeProduto: item.nomeProdutoParceiro,
        quantidade: 1,
        precoRegular: item.precoRegularParceiro,
        custoMedio: item.custoMedioParceiro,
      },
    ],
  };
}

export function SugestaoKitsScreen() {
  const { profile } = useAuth();
  const [macroGrupo, setMacroGrupo] = useState<MacroGrupo | null>(null);
  const [margemMinima, setMargemMinima] = useState('20');
  const [descontoAlvo, setDescontoAlvo] = useState('20');
  const [catalogo, setCatalogo] = useState<ProdutoCatalogo[]>([]);
  const [gerando, setGerando] = useState(false);
  const [gerada, setGerada] = useState(false);
  const [itens, setItens] = useState<ItemSugerido[]>([]);
  // Buffer de texto por par, desacoplado do número guardado em itens —
  // sem isso, digitar "12," recalculava na hora via parseDecimalBR e o
  // TextInput reformatava de volta pra "12", comendo a vírgula antes
  // do usuário terminar de digitar o decimal (mesmo achado 26/08/2026
  // documentado em CampanhasScreen.textosPreco/CartazetesScreen.kitBuffers).
  const [valorBuffer, setValorBuffer] = useState<Record<string, string>>({});

  const [nome, setNome] = useState('');
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(somarDias(todayISO(), 7));
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const gerarSugestoes = async () => {
    if (!profile || !macroGrupo) return;
    setGerando(true);
    try {
      let catalogoAtual = catalogo;
      if (catalogoAtual.length === 0) {
        catalogoAtual = await repository.getCatalogoProdutos(profile);
        setCatalogo(catalogoAtual);
      }
      const codigosSeed = resolverCodigosSeed(catalogoAtual, macroGrupo);
      if (codigosSeed.length === 0) {
        alertar('Nenhum produto nessa categoria', 'Escolha outra categoria — o catálogo não tem produto classificado nela.');
        setItens([]);
        setGerada(true);
        return;
      }

      const margemMinimaPct = Number(margemMinima.replace(',', '.')) || 0;
      const descontoAlvoPct = Number(descontoAlvo.replace(',', '.')) || 0;
      const sugestoes = await repository.sugerirParesAfinidade(profile, { macroGrupo });
      const itensGerados: ItemSugerido[] = sugestoes.map((s) => {
        const { percentualDesconto } = calcularKitPercentualSustentavel(produtosParaCalculo(s), descontoAlvoPct, margemMinimaPct);
        const { precoFixo } = calcularKitPrecoFixoSustentavel(produtosParaCalculo(s), margemMinimaPct);
        return {
          ...s,
          chave: `${s.codigoProdutoSeed}-${s.codigoProdutoParceiro}`,
          selecionado: false,
          tipoPrecificacao: 'percentual',
          percentualDescontoItem: percentualDesconto,
          precoFixo,
        };
      });
      setItens(itensGerados);
      setGerada(true);
    } catch (erro) {
      alertar('Erro ao gerar sugestões', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  const alternarSelecionado = (chave: string) => {
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, selecionado: !i.selecionado } : i)));
  };

  const alternarTipo = (chave: string, tipo: TipoPrecificacaoKit) => {
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, tipoPrecificacao: tipo } : i)));
    // troca de tipo troca qual campo aparece — limpa o buffer do campo
    // anterior pra não vazar texto de "% desconto" pro campo de preço
    // fixo (ou vice-versa) quando o gestor voltar a editar.
    setValorBuffer((atual) => {
      const { [chave]: _removido, ...resto } = atual;
      return resto;
    });
  };

  const valorExibido = (item: ItemSugerido): string => {
    const digitado = valorBuffer[item.chave];
    if (digitado !== undefined) return digitado;
    return item.tipoPrecificacao === 'percentual'
      ? formatDecimalBR(item.percentualDescontoItem)
      : formatDecimalBR(item.precoFixo);
  };

  const digitarValor = (chave: string, texto: string) => {
    setValorBuffer((atual) => ({ ...atual, [chave]: texto }));
  };

  // Confirma ao sair do campo (onBlur) — mesmo padrão de
  // CartazetesScreen.confirmarValorKit, com clamp nos limites que o
  // banco exige (campanha_kits_precificacao_coerente/checks em
  // migracao_kits_afinidade.sql): percentual 0-100, preço fixo > 0.
  // Sem isso, um valor fora da faixa só falhava no INSERT com um erro
  // de constraint cru, direto pro alerta genérico de "Erro ao salvar".
  const confirmarValor = (chave: string) => {
    const texto = valorBuffer[chave];
    if (texto !== undefined) {
      const digitado = parseDecimalBR(texto);
      setItens((atual) =>
        atual.map((i) => {
          if (i.chave !== chave) return i;
          if (i.tipoPrecificacao === 'percentual') {
            return { ...i, percentualDescontoItem: Math.min(100, Math.max(0, round2(digitado))) };
          }
          return { ...i, precoFixo: Math.max(0.01, round2(digitado)) };
        })
      );
    }
    setValorBuffer((atual) => {
      const { [chave]: _removido, ...resto } = atual;
      return resto;
    });
  };

  const selecionados = itens.filter((i) => i.selecionado);

  const salvar = async () => {
    if (!nome.trim()) {
      alertar('Nome obrigatório', 'Dê um nome pra campanha antes de salvar.');
      return;
    }
    if (dataFim < dataInicio) {
      alertar('Datas inválidas', 'A data de fim precisa ser igual ou depois da data de início.');
      return;
    }
    if (selecionados.length === 0) {
      alertar('Nenhum kit selecionado', 'Marque pelo menos um par sugerido antes de salvar.');
      return;
    }

    setSalvando(true);
    try {
      const kits: KitMultiProduto[] = selecionados.map((item) => itemParaKit(item, dataInicio, dataFim));

      await repository.salvarCampanha({ nome: nome.trim(), dataInicio, dataFim, produtos: [], kits });
      alertar('Campanha criada', `"${nome.trim()}" criada com ${kits.length} kit(s) — ajuste preço e imprima em Cartazetes.`);
      setNome('');
      setItens([]);
      setGerada(false);
      setMacroGrupo(null);
    } catch (erro) {
      alertar('Erro ao salvar campanha', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.conteudo}>
      <Text style={styles.title}>🧺 Kits sugeridos</Text>
      <Text style={styles.subtitle}>
        Produtos DIFERENTES que os clientes já compram juntos, calculado a partir da venda real — escolha uma
        categoria pra começar.
      </Text>

      <Card>
        <Text style={styles.cardTitulo}>Categoria</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filtroRow}>
            {ORDEM_MACRO_GRUPOS.map((grupo) => (
              <Pressable
                key={grupo}
                style={[styles.filtroChip, macroGrupo === grupo && styles.filtroChipAtivo]}
                onPress={() => setMacroGrupo(grupo)}
              >
                <Text style={[styles.filtroChipTexto, macroGrupo === grupo && styles.filtroChipTextoAtivo]}>
                  {MACRO_GRUPO_LABEL[grupo]}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.linhaDoisCampos}>
          <View style={styles.campoMetade}>
            <Text style={[styles.rotulo, styles.espacado]}>Margem mínima (%)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={margemMinima} onChangeText={setMargemMinima} />
          </View>
          <View style={styles.campoMetade}>
            <Text style={[styles.rotulo, styles.espacado]}>Desconto alvo (%)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={descontoAlvo} onChangeText={setDescontoAlvo} />
          </View>
        </View>

        <Pressable
          style={[styles.botaoGerar, !macroGrupo && styles.botaoDesabilitado]}
          onPress={gerarSugestoes}
          disabled={!macroGrupo || gerando}
        >
          {gerando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botaoGerarTexto}>Gerar sugestões</Text>
          )}
        </Pressable>
      </Card>

      {gerada && (
        <>
          <Text style={styles.sectionTitulo}>Pares sugeridos ({itens.length})</Text>
          {itens.length === 0 ? (
            <Card>
              <Text style={styles.empty}>
                Nenhum par com co-ocorrência relevante nessa categoria no período analisado.
              </Text>
            </Card>
          ) : (
            itens.map((item) => (
              <Card key={item.chave}>
                <Pressable style={styles.itemHeaderRow} onPress={() => alternarSelecionado(item.chave)}>
                  <Ionicons
                    name={item.selecionado ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={item.selecionado ? colors.navy : colors.textMuted}
                  />
                  <View style={styles.itemHeaderTexto}>
                    <Text style={styles.itemNome} numberOfLines={2}>
                      {item.nomeProdutoSeed} + {item.nomeProdutoParceiro}
                    </Text>
                    <Text style={styles.itemSubinfo}>
                      {item.coOcorrencias} venda(s) juntos · lift {item.lift.toFixed(2)} · {formatBRL(totalRegularDoPar(item))} juntos
                    </Text>
                  </View>
                </Pressable>

                {item.selecionado && (
                  <View style={styles.painelExpandido}>
                    <Text style={styles.campoLabel}>Tipo de preço</Text>
                    <View style={styles.grupoGrid}>
                      <Pressable
                        style={[styles.chip, item.tipoPrecificacao === 'percentual' && styles.chipAtivo]}
                        onPress={() => alternarTipo(item.chave, 'percentual')}
                      >
                        <Text style={[styles.chipTexto, item.tipoPrecificacao === 'percentual' && styles.chipTextoAtivo]}>
                          % de desconto no combo
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chip, item.tipoPrecificacao === 'preco_fixo' && styles.chipAtivo]}
                        onPress={() => alternarTipo(item.chave, 'preco_fixo')}
                      >
                        <Text style={[styles.chipTexto, item.tipoPrecificacao === 'preco_fixo' && styles.chipTextoAtivo]}>
                          Preço fixo do combo
                        </Text>
                      </Pressable>
                    </View>

                    {item.tipoPrecificacao === 'percentual' ? (
                      <>
                        <Text style={styles.campoLabel}>Desconto (%)</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={valorExibido(item)}
                          onChangeText={(texto) => digitarValor(item.chave, texto)}
                          onBlur={() => confirmarValor(item.chave)}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.campoLabel}>Preço fixo (R$)</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={valorExibido(item)}
                          onChangeText={(texto) => digitarValor(item.chave, texto)}
                          onBlur={() => confirmarValor(item.chave)}
                        />
                      </>
                    )}

                    <Text style={styles.previaTexto}>{descricaoKitMultiProduto(itemParaKit(item, dataInicio, dataFim))}</Text>
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}

      {selecionados.length > 0 && (
        <Card>
          <Text style={styles.cardTitulo}>Criar campanha com {selecionados.length} kit(s)</Text>
          <TextInput style={styles.input} placeholder="Nome da campanha" value={nome} onChangeText={setNome} />
          <Text style={[styles.rotulo, styles.espacado]}>Período</Text>
          <Pressable style={styles.botaoPeriodo} onPress={() => setCalendarioAberto(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.navy} />
            <Text style={styles.botaoPeriodoTexto}>
              {dataInicio === dataFim ? formatDateBR(dataInicio) : `${formatDateBR(dataInicio)} até ${formatDateBR(dataFim)}`}
            </Text>
          </Pressable>

          <Pressable style={styles.botaoGerar} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoGerarTexto}>Salvar campanha</Text>}
          </Pressable>
        </Card>
      )}

      <CalendarioPeriodo
        visible={calendarioAberto}
        onClose={() => setCalendarioAberto(false)}
        permitirDatasFuturas
        onConfirmar={(inicio, fim) => {
          setDataInicio(inicio);
          setDataFim(fim);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  conteudo: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 16, marginBottom: 8 },
  rotulo: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  espacado: { marginTop: 10 },
  filtroRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filtroChip: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtroChipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  filtroChipTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  filtroChipTextoAtivo: { color: colors.white },
  linhaDoisCampos: { flexDirection: 'row', gap: 10 },
  campoMetade: { flex: 1 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 4,
  },
  botaoGerar: {
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  botaoDesabilitado: { opacity: 0.5 },
  botaoGerarTexto: { color: colors.white, fontWeight: '700', fontSize: 14 },
  itemHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemHeaderTexto: { flex: 1 },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  itemSubinfo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  painelExpandido: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  campoLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  grupoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAtivo: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  chipTextoAtivo: { color: colors.white },
  previaTexto: { fontSize: 12, color: colors.navy, fontWeight: '600', marginTop: 10 },
  botaoPeriodo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  botaoPeriodoTexto: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
});
