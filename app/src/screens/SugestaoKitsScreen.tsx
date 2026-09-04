import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { CalendarioPeriodo } from '../components/CalendarioPeriodo';
import { ComparativoCustoVenda } from '../components/ComparativoCustoVenda';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR, formatDecimalBR, parseDecimalBR, todayISO } from '../lib/format';
import { alertar, confirmar } from '../lib/alert';
import { MACRO_GRUPO_LABEL, MacroGrupo, ORDEM_MACRO_GRUPOS } from '../lib/macroGrupo';
import { resolverCodigosSeed } from '../lib/afinidadeKits';
import {
  calcularKitPercentualSustentavel,
  calcularKitPrecoFixoSustentavel,
  descricaoKit,
  descricaoKitMultiProduto,
  margemResultanteKitMultiProduto,
  margemResultanteKitProdutoUnico,
  PRESETS_KIT,
} from '../lib/kits';
import {
  CampanhaProduto,
  KitMultiProduto,
  KitPromocao,
  ProdutoCatalogo,
  SugestaoParAfinidade,
  TipoPrecificacaoKit,
} from '../types/domain';

type ModoKit = 'diferentes' | 'mesmo_item';

interface ItemMesmoProduto {
  codigoProduto: number;
  codigoBarras: string;
  nomeProduto: string;
  precoRegular: number;
  custoMedio: number;
  kit: KitPromocao;
}

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

interface CardParSugeridoProps {
  item: ItemSugerido;
  dataInicio: string;
  dataFim: string;
  onToggle: (chave: string) => void;
  onAlternarTipo: (chave: string, tipo: TipoPrecificacaoKit) => void;
  valorExibido: (item: ItemSugerido) => string;
  onDigitarValor: (chave: string, texto: string) => void;
  onConfirmarValor: (chave: string) => void;
}

// Um card por par sugerido — usado tanto na seção "Selecionados"
// quanto em "Pares sugeridos" (mesmo componente, só muda em qual lista
// está). Nome do produto vem acompanhado do código (02/09/2026,
// pedido explícito): o catálogo real tem VÁRIOS códigos com o mesmo
// nome de produto (lotes/fornecedores diferentes na Trier) — sem o
// código, não dá pra saber qual custo específico está sendo usado.
function CardParSugerido({
  item,
  dataInicio,
  dataFim,
  onToggle,
  onAlternarTipo,
  valorExibido,
  onDigitarValor,
  onConfirmarValor,
}: CardParSugeridoProps) {
  const { totalCusto, precoFinal, margemPct } = margemResultanteKitMultiProduto(itemParaKit(item, dataInicio, dataFim));
  return (
    <Card>
      <Pressable style={styles.itemHeaderRow} onPress={() => onToggle(item.chave)}>
        <Ionicons
          name={item.selecionado ? 'checkbox' : 'square-outline'}
          size={22}
          color={item.selecionado ? colors.navy : colors.textMuted}
        />
        <View style={styles.itemHeaderTexto}>
          <Text style={styles.itemNome} numberOfLines={2}>
            {item.nomeProdutoSeed} ({item.codigoProdutoSeed}) + {item.nomeProdutoParceiro} ({item.codigoProdutoParceiro})
          </Text>
          <Text style={styles.itemSubinfo}>
            {item.coOcorrencias} venda(s) juntos · lift {item.lift.toFixed(2)} · {formatBRL(totalRegularDoPar(item))} juntos
          </Text>
          <Text style={[styles.margemTexto, margemPct < 0 && styles.margemTextoNegativa]}>
            Preço de compra {formatBRL(totalCusto)} · margem {margemPct.toLocaleString('pt-BR')}%
          </Text>
        </View>
      </Pressable>

      {item.selecionado && (
        <View style={styles.painelExpandido}>
          <Text style={styles.campoLabel}>Tipo de preço</Text>
          <View style={styles.grupoGrid}>
            <Pressable
              style={[styles.chip, item.tipoPrecificacao === 'percentual' && styles.chipAtivo]}
              onPress={() => onAlternarTipo(item.chave, 'percentual')}
            >
              <Text style={[styles.chipTexto, item.tipoPrecificacao === 'percentual' && styles.chipTextoAtivo]}>
                % de desconto no combo
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, item.tipoPrecificacao === 'preco_fixo' && styles.chipAtivo]}
              onPress={() => onAlternarTipo(item.chave, 'preco_fixo')}
            >
              <Text style={[styles.chipTexto, item.tipoPrecificacao === 'preco_fixo' && styles.chipTextoAtivo]}>
                Preço fixo do combo
              </Text>
            </Pressable>
          </View>

          <Text style={styles.campoLabel}>{item.tipoPrecificacao === 'percentual' ? 'Desconto (%)' : 'Preço fixo (R$)'}</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={valorExibido(item)}
            onChangeText={(texto) => onDigitarValor(item.chave, texto)}
            onBlur={() => onConfirmarValor(item.chave)}
          />

          <Text style={styles.previaTexto}>{descricaoKitMultiProduto(itemParaKit(item, dataInicio, dataFim))}</Text>
          <Text style={styles.margemTexto}>
            {item.nomeProdutoSeed} ({item.codigoProdutoSeed}) {formatBRL(item.custoMedioSeed)} + {item.nomeProdutoParceiro} (
            {item.codigoProdutoParceiro}) {formatBRL(item.custoMedioParceiro)}
          </Text>
          <ComparativoCustoVenda custo={totalCusto} venda={precoFinal} legenda="por kit" />
        </View>
      )}
    </Card>
  );
}

export function SugestaoKitsScreen() {
  const { profile } = useAuth();
  const [modo, setModo] = useState<ModoKit>('diferentes');
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

  // Modo "Mesmo item" — kit de produto único (leve N, pague menos),
  // pedido explícito 02/09/2026: até aqui só dava pra criar esse tipo
  // de kit depois, na tela Cartazetes, convertendo um item já existente
  // de uma campanha comum. Monta um por vez (busca produto, configura,
  // adiciona à lista) — mesma fórmula/painel já usado em CartazetesScreen.
  const [buscaProdutoMesmo, setBuscaProdutoMesmo] = useState('');
  const [produtoEscolhido, setProdutoEscolhido] = useState<ProdutoCatalogo | null>(null);
  const KIT_PADRAO: KitPromocao = { quantidadeMinima: 2, tipoPrecificacao: 'percentual', percentualDescontoItem: 0, precoFixo: null };
  const [kitConfig, setKitConfig] = useState<KitPromocao>(KIT_PADRAO);
  const [kitQuantidadeBuffer, setKitQuantidadeBuffer] = useState<string | undefined>(undefined);
  const [kitValorBuffer, setKitValorBuffer] = useState<string | undefined>(undefined);
  const [itensMesmoProduto, setItensMesmoProduto] = useState<ItemMesmoProduto[]>([]);

  const [nome, setNome] = useState('');
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(somarDias(todayISO(), 7));
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const escolherModo = async (novoModo: ModoKit) => {
    setModo(novoModo);
    if (novoModo === 'mesmo_item' && catalogo.length === 0 && profile) {
      setCatalogo(await repository.getCatalogoProdutos(profile));
    }
  };

  const resultadosBuscaProdutoMesmo =
    buscaProdutoMesmo.trim().length < 2
      ? []
      : catalogo
          .filter((p) => {
            const termo = buscaProdutoMesmo.trim().toLowerCase();
            return p.nome.toLowerCase().includes(termo) || String(p.codigo).includes(termo);
          })
          .slice(0, 8);

  const escolherProdutoMesmo = (produto: ProdutoCatalogo) => {
    setProdutoEscolhido(produto);
    setBuscaProdutoMesmo('');
    const margemMinimaPct = parseDecimalBR(margemMinima) || 0;
    const descontoAlvoPct = parseDecimalBR(descontoAlvo) || 0;
    const { percentualDesconto } = calcularKitPercentualSustentavel(
      [{ precoVenda: produto.precoVenda, custoMedio: produto.custoMedio, quantidade: 2 }],
      descontoAlvoPct,
      margemMinimaPct
    );
    setKitConfig({ quantidadeMinima: 2, tipoPrecificacao: 'percentual', percentualDescontoItem: percentualDesconto, precoFixo: null });
    setKitQuantidadeBuffer(undefined);
    setKitValorBuffer(undefined);
  };

  const confirmarKitQuantidadeMesmo = () => {
    if (kitQuantidadeBuffer !== undefined) {
      const quantidade = Math.max(2, Math.round(parseDecimalBR(kitQuantidadeBuffer)) || 2);
      setKitConfig((atual) => ({ ...atual, quantidadeMinima: quantidade }));
    }
    setKitQuantidadeBuffer(undefined);
  };

  const confirmarKitValorMesmo = () => {
    if (kitValorBuffer !== undefined) {
      const digitado = parseDecimalBR(kitValorBuffer);
      setKitConfig((atual) =>
        atual.tipoPrecificacao === 'preco_fixo'
          ? { ...atual, precoFixo: Math.max(0.01, round2(digitado)) }
          : { ...atual, percentualDescontoItem: Math.min(100, Math.max(0, round2(digitado))) }
      );
    }
    setKitValorBuffer(undefined);
  };

  // Mesmo espírito de alternarTipoPrecificacaoKitProduto (CartazetesScreen)
  // — converte o valor pro novo formato em vez de zerar.
  const alternarTipoPrecificacaoMesmo = (tipo: TipoPrecificacaoKit) => {
    if (!produtoEscolhido) return;
    setKitConfig((atual) => {
      if (tipo === atual.tipoPrecificacao) return atual;
      const totalRegular = produtoEscolhido.precoVenda * atual.quantidadeMinima;
      if (tipo === 'preco_fixo') {
        const percentual = atual.percentualDescontoItem ?? 0;
        return { ...atual, tipoPrecificacao: tipo, precoFixo: round2(totalRegular * (1 - percentual / 100)), percentualDescontoItem: null };
      }
      const precoFixo = atual.precoFixo ?? totalRegular;
      const percentual = totalRegular > 0 ? Math.max(0, round2(((totalRegular - precoFixo) / totalRegular) * 100)) : 0;
      return { ...atual, tipoPrecificacao: tipo, percentualDescontoItem: percentual, precoFixo: null };
    });
  };

  const valorExibidoKitMesmo = (campo: 'quantidade' | 'valor'): string => {
    if (campo === 'quantidade') return kitQuantidadeBuffer ?? String(kitConfig.quantidadeMinima);
    if (kitValorBuffer !== undefined) return kitValorBuffer;
    return kitConfig.tipoPrecificacao === 'preco_fixo'
      ? formatDecimalBR(kitConfig.precoFixo ?? 0)
      : formatDecimalBR(kitConfig.percentualDescontoItem ?? 0);
  };

  const adicionarKitMesmoProduto = () => {
    if (!produtoEscolhido) return;
    setItensMesmoProduto((atual) => [
      ...atual,
      {
        codigoProduto: produtoEscolhido.codigo,
        codigoBarras: produtoEscolhido.codigoBarras,
        nomeProduto: produtoEscolhido.nome,
        precoRegular: produtoEscolhido.precoVenda,
        custoMedio: produtoEscolhido.custoMedio,
        kit: kitConfig,
      },
    ]);
    setProdutoEscolhido(null);
    setKitConfig(KIT_PADRAO);
  };

  const removerKitMesmoProduto = (codigoProduto: number) => {
    setItensMesmoProduto((atual) => atual.filter((i) => i.codigoProduto !== codigoProduto));
  };

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
        // mantém o que já estava selecionado — só limpa as sugestões
        // não-selecionadas dessa tentativa (não teve nenhuma mesmo).
        setItens((atual) => atual.filter((i) => i.selecionado));
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
      // Gerar de novo (outra categoria, por ex.) NÃO apaga o que já
      // tinha sido selecionado — pedido explícito, pra dar pra montar
      // vários kits de várias categorias numa campanha só. Só descarta
      // os NÃO selecionados da geração anterior (lixo de navegação).
      setItens((atual) => {
        const selecionadosAtuais = atual.filter((i) => i.selecionado);
        const chavesJaSelecionadas = new Set(selecionadosAtuais.map((i) => i.chave));
        const novos = itensGerados.filter((i) => !chavesJaSelecionadas.has(i.chave));
        return [...selecionadosAtuais, ...novos];
      });
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
  const naoSelecionados = itens.filter((i) => !i.selecionado);

  const salvar = async () => {
    setSalvando(true);
    try {
      const kits: KitMultiProduto[] = selecionados.map((item) => itemParaKit(item, dataInicio, dataFim));
      // Kit de produto único vira CampanhaProduto com tipoPromocao 'kit'
      // (mesmo formato que CartazetesScreen já grava) — precoPromocional/
      // percentualDesconto aqui são só um resumo pra exibição, quem manda
      // no cartaz de verdade é o objeto `kit`.
      const produtosMesmoItem: CampanhaProduto[] = itensMesmoProduto.map((item) => {
        const { precoMedioUnidade } = margemResultanteKitProdutoUnico(item.kit, item.precoRegular, item.custoMedio);
        const percentualDesconto =
          item.precoRegular > 0 ? round2(((item.precoRegular - precoMedioUnidade) / item.precoRegular) * 100) : 0;
        return {
          codigoProduto: item.codigoProduto,
          codigoBarras: item.codigoBarras,
          nomeProduto: item.nomeProduto,
          precoRegular: item.precoRegular,
          custoMedio: item.custoMedio,
          precoPromocional: precoMedioUnidade,
          percentualDesconto,
          quantidadeCartazes: 1,
          dataInicio,
          dataFim,
          tipoPromocao: 'kit',
          kit: item.kit,
        };
      });
      const totalKits = kits.length + produtosMesmoItem.length;

      await repository.salvarCampanha({ nome: nome.trim(), dataInicio, dataFim, produtos: produtosMesmoItem, kits });
      alertar('Campanha criada', `"${nome.trim()}" criada com ${totalKits} kit(s) — ajuste preço e imprima em Cartazetes.`);
      setNome('');
      setItens([]);
      setItensMesmoProduto([]);
      setGerada(false);
      setMacroGrupo(null);
    } catch (erro) {
      alertar('Erro ao salvar campanha', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const totalSelecionado = selecionados.length + itensMesmoProduto.length;

  // Botão "Fechar campanha" pede confirmação antes de gravar — pedido
  // explícito ("quando fechar, confirme"), já que pode juntar kits de
  // várias categorias acumuladas (dos dois modos) e vale um último
  // "tem certeza" antes de criar de vez.
  const confirmarEFechar = () => {
    if (!nome.trim()) {
      alertar('Nome obrigatório', 'Dê um nome pra campanha antes de fechar.');
      return;
    }
    if (dataFim < dataInicio) {
      alertar('Datas inválidas', 'A data de fim precisa ser igual ou depois da data de início.');
      return;
    }
    if (totalSelecionado === 0) {
      alertar('Nenhum kit selecionado', 'Marque pelo menos um kit antes de fechar.');
      return;
    }
    confirmar(
      'Fechar campanha',
      `Confirma criar "${nome.trim()}" com ${totalSelecionado} kit(s)? Depois é só ajustar preço/imprimir em Cartazetes.`,
      salvar,
      { textoConfirmar: 'Fechar campanha' }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.conteudo}>
      <Text style={styles.title}>🧺 Kits sugeridos</Text>
      <Text style={styles.subtitle}>
        {modo === 'diferentes'
          ? 'Produtos DIFERENTES que os clientes já compram juntos, calculado a partir da venda real — escolha uma categoria pra começar.'
          : 'Kit do MESMO produto (ex.: leve 3, pague 2) — escolha o produto e configure a quantidade/desconto.'}
      </Text>

      <View style={styles.segmentedWrap}>
        <Pressable
          style={[styles.segmentButton, modo === 'diferentes' && styles.segmentButtonAtivo]}
          onPress={() => escolherModo('diferentes')}
        >
          <Text style={[styles.segmentText, modo === 'diferentes' && styles.segmentTextAtivo]}>Itens diferentes</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentButton, modo === 'mesmo_item' && styles.segmentButtonAtivo]}
          onPress={() => escolherModo('mesmo_item')}
        >
          <Text style={[styles.segmentText, modo === 'mesmo_item' && styles.segmentTextAtivo]}>Mesmo item</Text>
        </Pressable>
      </View>

      {modo === 'mesmo_item' && (
        <>
          <Card>
            <Text style={styles.cardTitulo}>Produto</Text>
            <TextInput
              style={styles.input}
              placeholder="Buscar produto pelo nome ou código"
              value={buscaProdutoMesmo}
              onChangeText={setBuscaProdutoMesmo}
            />
            {resultadosBuscaProdutoMesmo.map((p) => (
              <Pressable key={p.codigo} style={styles.resultadoBusca} onPress={() => escolherProdutoMesmo(p)}>
                <Text style={styles.resultadoBuscaTexto} numberOfLines={1}>
                  {p.nome} · cód. {p.codigo}
                </Text>
                <Ionicons name="add-circle" size={20} color={colors.navy} />
              </Pressable>
            ))}

            {produtoEscolhido && (
              <View style={styles.painelExpandido}>
                <Text style={styles.campoLabel}>Produto escolhido</Text>
                <Text style={styles.campoSomenteLeitura}>
                  {produtoEscolhido.nome} · cód. {produtoEscolhido.codigo} · {formatBRL(produtoEscolhido.precoVenda)}
                </Text>

                <Text style={[styles.campoLabel, styles.grupoLabelEspacado]}>Atalhos</Text>
                <View style={styles.grupoGrid}>
                  {PRESETS_KIT.map((preset) => {
                    const ativo =
                      kitConfig.quantidadeMinima === preset.kit.quantidadeMinima &&
                      kitConfig.tipoPrecificacao === preset.kit.tipoPrecificacao &&
                      kitConfig.percentualDescontoItem === preset.kit.percentualDescontoItem;
                    return (
                      <Pressable
                        key={preset.label}
                        style={[styles.chip, ativo && styles.chipAtivo]}
                        onPress={() => setKitConfig(preset.kit)}
                      >
                        <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{preset.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.campoLabel}>Quantidade mínima</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={valorExibidoKitMesmo('quantidade')}
                  onChangeText={setKitQuantidadeBuffer}
                  onBlur={confirmarKitQuantidadeMesmo}
                />

                <Text style={[styles.campoLabel, styles.grupoLabelEspacado]}>Tipo de preço</Text>
                <View style={styles.grupoGrid}>
                  <Pressable
                    style={[styles.chip, kitConfig.tipoPrecificacao === 'percentual' && styles.chipAtivo]}
                    onPress={() => alternarTipoPrecificacaoMesmo('percentual')}
                  >
                    <Text style={[styles.chipTexto, kitConfig.tipoPrecificacao === 'percentual' && styles.chipTextoAtivo]}>
                      % no {kitConfig.quantidadeMinima}º item
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, kitConfig.tipoPrecificacao === 'preco_fixo' && styles.chipAtivo]}
                    onPress={() => alternarTipoPrecificacaoMesmo('preco_fixo')}
                  >
                    <Text style={[styles.chipTexto, kitConfig.tipoPrecificacao === 'preco_fixo' && styles.chipTextoAtivo]}>
                      Preço fixo pra {kitConfig.quantidadeMinima}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.campoLabel}>
                  {kitConfig.tipoPrecificacao === 'preco_fixo'
                    ? `Preço fixo (R$) pras ${kitConfig.quantidadeMinima} unidades`
                    : 'Desconto (%) no último item'}
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={valorExibidoKitMesmo('valor')}
                  onChangeText={setKitValorBuffer}
                  onBlur={confirmarKitValorMesmo}
                />

                {(() => {
                  const { totalCusto, totalPago } = margemResultanteKitProdutoUnico(
                    kitConfig,
                    produtoEscolhido.precoVenda,
                    produtoEscolhido.custoMedio
                  );
                  return (
                    <>
                      <Text style={styles.previaTexto}>{descricaoKit(kitConfig)}</Text>
                      <ComparativoCustoVenda custo={totalCusto} venda={totalPago} legenda={`por ${kitConfig.quantidadeMinima} unidades`} />
                    </>
                  );
                })()}

                <Pressable style={styles.botaoGerar} onPress={adicionarKitMesmoProduto}>
                  <Text style={styles.botaoGerarTexto}>Adicionar à lista</Text>
                </Pressable>
              </View>
            )}
          </Card>

          {itensMesmoProduto.length > 0 && (
            <>
              <Text style={styles.sectionTitulo}>Kits de item único ({itensMesmoProduto.length})</Text>
              {itensMesmoProduto.map((item) => (
                <Card key={item.codigoProduto}>
                  <View style={styles.itemHeaderRow}>
                    <View style={styles.itemHeaderTexto}>
                      <Text style={styles.itemNome} numberOfLines={2}>
                        {item.nomeProduto} ({item.codigoProduto})
                      </Text>
                      <Text style={styles.itemSubinfo}>{descricaoKit(item.kit)}</Text>
                    </View>
                    <Pressable onPress={() => removerKitMesmoProduto(item.codigoProduto)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={colors.red} />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {modo === 'diferentes' && (
      <>
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

      {selecionados.length > 0 && (
        <>
          <Text style={styles.sectionTitulo}>Selecionados ({selecionados.length})</Text>
          {selecionados.map((item) => (
            <CardParSugerido
              key={item.chave}
              item={item}
              dataInicio={dataInicio}
              dataFim={dataFim}
              onToggle={alternarSelecionado}
              onAlternarTipo={alternarTipo}
              valorExibido={valorExibido}
              onDigitarValor={digitarValor}
              onConfirmarValor={confirmarValor}
            />
          ))}
        </>
      )}

      {gerada && (
        <>
          <Text style={styles.sectionTitulo}>Pares sugeridos ({naoSelecionados.length})</Text>
          {naoSelecionados.length === 0 ? (
            <Card>
              <Text style={styles.empty}>
                {itens.length === 0
                  ? 'Nenhum par com co-ocorrência relevante nessa categoria no período analisado.'
                  : 'Todos os pares sugeridos dessa categoria já estão selecionados acima.'}
              </Text>
            </Card>
          ) : (
            naoSelecionados.map((item) => (
              <CardParSugerido
                key={item.chave}
                item={item}
                dataInicio={dataInicio}
                dataFim={dataFim}
                onToggle={alternarSelecionado}
                onAlternarTipo={alternarTipo}
                valorExibido={valorExibido}
                onDigitarValor={digitarValor}
                onConfirmarValor={confirmarValor}
              />
            ))
          )}
        </>
      )}
      </>
      )}

      {totalSelecionado > 0 && (
        <Card>
          <Text style={styles.cardTitulo}>Fechar campanha com {totalSelecionado} kit(s)</Text>
          <Text style={styles.subinfoFechar}>
            Pode trocar de modo/categoria acima e adicionar mais kits — o que já está selecionado (nos dois modos) fica
            guardado até você fechar.
          </Text>
          <TextInput style={styles.input} placeholder="Nome da campanha" value={nome} onChangeText={setNome} />
          <Text style={[styles.rotulo, styles.espacado]}>Período</Text>
          <Pressable style={styles.botaoPeriodo} onPress={() => setCalendarioAberto(true)}>
            <Ionicons name="calendar-outline" size={18} color={colors.navy} />
            <Text style={styles.botaoPeriodoTexto}>
              {dataInicio === dataFim ? formatDateBR(dataInicio) : `${formatDateBR(dataInicio)} até ${formatDateBR(dataFim)}`}
            </Text>
          </Pressable>

          <Pressable style={styles.botaoGerar} onPress={confirmarEFechar} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoGerarTexto}>Fechar campanha</Text>}
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
  subinfoFechar: { fontSize: 12, color: colors.textSecondary, marginBottom: 10, lineHeight: 17 },
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
  margemTexto: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  margemTextoNegativa: { color: colors.red, fontWeight: '600' },
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
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentButtonAtivo: { backgroundColor: colors.navy },
  segmentText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  segmentTextAtivo: { color: colors.white },
  resultadoBusca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultadoBuscaTexto: { flex: 1, fontSize: 13, color: colors.textPrimary, marginRight: 8 },
  campoSomenteLeitura: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  grupoLabelEspacado: { marginTop: 14 },
});
