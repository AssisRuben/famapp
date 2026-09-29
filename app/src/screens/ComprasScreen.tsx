import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR, todayISO } from '../lib/format';
import { gerarXlsxSugestaoCompras } from '../lib/comprasXlsx';
import { gerarXlsxRelatorioFaltas } from '../lib/faltasXlsx';
import { baixarArquivoBase64NoWeb } from '../lib/downloadWeb';
import { alertar, confirmar } from '../lib/alert';
import { ORDEM_MACRO_GRUPOS, MACRO_GRUPO_LABEL, MacroGrupo } from '../lib/macroGrupo';
import { MOTIVO_CLASSIFICACAO_LABEL, ORDEM_MOTIVOS_CLASSIFICACAO } from '../lib/comprasClassificacao';
import { textoCobertura } from '../lib/equivalentes';
import { explicarQuantidade } from '../lib/doseCerta';
import {
  FormulaCompra,
  ItemClassificacaoCompra,
  ItemEstoqueZeradoGiroAlto,
  ItemRelatorioFalta,
  MotivoClassificacaoCompra,
  PedidoPendenteCompra,
  SugestaoCompra,
} from '../types/domain';

// "outros_administrativo" nunca aparece na sugestão (doseCerta.ts já
// filtra fora, é serviço/ajuste de sistema, não produto pra repor) —
// não faz sentido oferecer como opção de filtro aqui.
const GRUPOS_SELECIONAVEIS = ORDEM_MACRO_GRUPOS.filter((g) => g !== 'outros_administrativo');

export function ComprasScreen() {
  const { profile } = useAuth();
  const [diasSeguranca, setDiasSeguranca] = useState('7');
  const [diasCobertura, setDiasCobertura] = useState('15');
  const [diasBaseVenda, setDiasBaseVenda] = useState('30');
  const [formula, setFormula] = useState<FormulaCompra>('inteligente');
  const [pedidosPendentes, setPedidosPendentes] = useState<PedidoPendenteCompra[]>([]);
  const [mostrarPendentes, setMostrarPendentes] = useState(false);
  const [macroGruposSelecionados, setMacroGruposSelecionados] = useState<MacroGrupo[]>([]);
  const [itens, setItens] = useState<SugestaoCompra[] | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [faltas, setFaltas] = useState<ItemRelatorioFalta[]>([]);
  const [carregandoFaltas, setCarregandoFaltas] = useState(true);
  const [gerandoFaltas, setGerandoFaltas] = useState(false);
  const [estoqueZeradoGiroAlto, setEstoqueZeradoGiroAlto] = useState<ItemEstoqueZeradoGiroAlto[]>([]);
  const [carregandoEstoqueZeradoGiroAlto, setCarregandoEstoqueZeradoGiroAlto] = useState(true);
  const [mostrarEstoqueZeradoGiroAlto, setMostrarEstoqueZeradoGiroAlto] = useState(false);
  const [classificacoes, setClassificacoes] = useState<ItemClassificacaoCompra[]>([]);
  const [carregandoClassificacoes, setCarregandoClassificacoes] = useState(true);
  const [mostrarClassificados, setMostrarClassificados] = useState(false);
  const [mostrarCobertos, setMostrarCobertos] = useState(false);
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [classificando, setClassificando] = useState(false);
  const [modalOutrosAberto, setModalOutrosAberto] = useState(false);
  const [observacaoOutros, setObservacaoOutros] = useState('');

  const carregarFaltas = useCallback(async () => {
    if (!profile) return;
    setCarregandoFaltas(true);
    try {
      setFaltas(await repository.gerarRelatorioFaltas(profile));
    } finally {
      setCarregandoFaltas(false);
    }
  }, [profile]);

  const carregarPedidosPendentes = useCallback(async () => {
    try {
      setPedidosPendentes(await repository.getPedidosPendentesCompra());
    } catch {
      setPedidosPendentes([]);
    }
  }, []);

  const carregarClassificacoes = useCallback(async () => {
    if (!profile) return;
    setCarregandoClassificacoes(true);
    try {
      setClassificacoes(await repository.getClassificacoesCompra(profile));
    } finally {
      setCarregandoClassificacoes(false);
    }
  }, [profile]);

  const carregarEstoqueZeradoGiroAlto = useCallback(async () => {
    if (!profile) return;
    setCarregandoEstoqueZeradoGiroAlto(true);
    try {
      setEstoqueZeradoGiroAlto(await repository.getEstoqueZeradoGiroAlto(profile));
    } finally {
      setCarregandoEstoqueZeradoGiroAlto(false);
    }
  }, [profile]);

  useEffect(() => {
    carregarFaltas();
    carregarClassificacoes();
    carregarPedidosPendentes();
    carregarEstoqueZeradoGiroAlto();
  }, [carregarFaltas, carregarClassificacoes, carregarEstoqueZeradoGiroAlto, carregarPedidosPendentes]);

  // Toque pra marcar, toque de novo pra tirar — dá pra marcar mais de
  // um (mesma dinâmica do filtro de vendedor no Checklist).
  const alternarMacroGrupo = (grupo: MacroGrupo) => {
    setMacroGruposSelecionados((atual) => (atual.includes(grupo) ? atual.filter((g) => g !== grupo) : [...atual, grupo]));
  };

  const gerar = async () => {
    if (!profile) return;
    setGerando(true);
    try {
      const params = {
        diasSeguranca: Math.max(0, Number(diasSeguranca.replace(/\D/g, '')) || 0),
        diasCobertura: Math.max(0, Number(diasCobertura.replace(/\D/g, '')) || 0),
        diasBaseVenda: Math.max(1, Number(diasBaseVenda.replace(/\D/g, '')) || 30),
        macroGrupos: macroGruposSelecionados,
        formula,
      };
      const sugestoes = await repository.gerarSugestaoCompras(profile, params);
      setItens(sugestoes);
      setExpandido(null);
    } catch (erro) {
      alertar('Erro ao gerar sugestão', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  // "Já pedi": registra o pedido feito ao fornecedor (fora do app) com a
  // quantidade sugerida e previsão de 7 dias — a fórmula inteligente
  // desconta até chegar. Some da lista atual na hora.
  const marcarJaPedi = (item: SugestaoCompra) => {
    const previsao = new Date();
    previsao.setDate(previsao.getDate() + 7);
    const previsaoIso = previsao.toISOString().slice(0, 10);
    confirmar(
      'Já pedi',
      `Registrar ${item.quantidadeSugerida} un. de "${item.nomeProduto}" como já pedidas? Sai da sugestão até ${formatDateBR(previsaoIso)} (previsão de chegada).`,
      async () => {
        try {
          await repository.marcarPedidoPendenteCompra(item.codigoProduto, item.quantidadeSugerida, previsaoIso);
          setItens((atual) => atual?.filter((i) => i.codigoProduto !== item.codigoProduto) ?? null);
          await carregarPedidosPendentes();
        } catch (erro) {
          alertar('Erro ao registrar pedido', erro instanceof Error ? erro.message : 'Tente novamente.');
        }
      },
      { textoConfirmar: 'Registrar' }
    );
  };

  const desfazerJaPedi = async (codigoProduto: number) => {
    try {
      await repository.removerPedidoPendenteCompra(codigoProduto);
      await carregarPedidosPendentes();
    } catch (erro) {
      alertar('Erro ao desfazer', erro instanceof Error ? erro.message : 'Tente novamente.');
    }
  };

  const alternarExpandido = (codigoProduto: number) => {
    setExpandido((atual) => (atual === codigoProduto ? null : codigoProduto));
  };

  const alternarSelecao = (codigoProduto: number) => {
    setSelecionados((atual) =>
      atual.includes(codigoProduto) ? atual.filter((c) => c !== codigoProduto) : [...atual, codigoProduto]
    );
  };

  const classificarSelecionados = async (motivo: MotivoClassificacaoCompra, observacao?: string) => {
    if (!profile || selecionados.length === 0) return;
    setClassificando(true);
    try {
      await repository.classificarItensCompra(profile, selecionados, motivo, observacao);
      setItens((atual) => atual?.filter((i) => !selecionados.includes(i.codigoProduto)) ?? null);
      setEstoqueZeradoGiroAlto((atual) => atual.filter((i) => !selecionados.includes(i.codigoProduto)));
      setSelecionados([]);
      await carregarClassificacoes();
    } catch (erro) {
      alertar('Erro ao classificar', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setClassificando(false);
    }
  };

  const confirmarOutros = async () => {
    setModalOutrosAberto(false);
    await classificarSelecionados('outros', observacaoOutros.trim() || undefined);
    setObservacaoOutros('');
  };

  const reincluir = async (codigoProduto: number) => {
    try {
      await repository.removerClassificacaoCompra(codigoProduto);
      setClassificacoes((atual) => atual.filter((c) => c.codigoProduto !== codigoProduto));
    } catch (erro) {
      alertar('Erro ao reincluir', erro instanceof Error ? erro.message : 'Tente novamente.');
    }
  };

  const ajustarQuantidade = (codigoProduto: number, texto: string) => {
    const quantidade = Math.max(0, Number(texto.replace(/\D/g, '')) || 0);
    setItens((atual) => atual?.map((i) => (i.codigoProduto === codigoProduto ? { ...i, quantidadeSugerida: quantidade } : i)) ?? null);
  };

  const totalItens = itens?.length ?? 0;
  const valorTotal = (itens ?? []).reduce((acc, i) => acc + i.quantidadeSugerida * i.custoMedio, 0);

  const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const exportarXlsx = async () => {
    if (!itens || itens.length === 0) return;
    setExportando(true);
    try {
      const base64 = gerarXlsxSugestaoCompras(itens);
      const nomeArquivo = `lista-compras-${todayISO()}.xlsx`;

      if (Platform.OS === 'web') {
        baixarArquivoBase64NoWeb(nomeArquivo, base64, MIME_XLSX);
        return;
      }

      const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });

      const podeCompartilhar = await Sharing.isAvailableAsync();
      if (podeCompartilhar) {
        await Sharing.shareAsync(uri, { mimeType: MIME_XLSX, dialogTitle: 'Exportar lista de compras' });
      } else {
        alertar('Arquivo gerado', `Salvo em: ${uri}`);
      }
    } catch (erro) {
      alertar('Erro ao exportar XLSX', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const gerarRelatorioFaltasEExportar = () => {
    if (faltas.length === 0) return;
    confirmar(
      'Gerar relatório e limpar faltas',
      `Gera o XLSX com ${faltas.length} falta(s) registrada(s) e apaga todas da lista — some daqui e da aba Produtos em falta. Não dá pra desfazer.`,
      async () => {
        setGerandoFaltas(true);
        try {
          const base64 = gerarXlsxRelatorioFaltas(faltas);
          const nomeArquivo = `faltas-${todayISO()}.xlsx`;

          if (Platform.OS === 'web') {
            baixarArquivoBase64NoWeb(nomeArquivo, base64, MIME_XLSX);
          } else {
            const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            const podeCompartilhar = await Sharing.isAvailableAsync();
            if (podeCompartilhar) {
              await Sharing.shareAsync(uri, { mimeType: MIME_XLSX, dialogTitle: 'Exportar relatório de faltas' });
            } else {
              alertar('Arquivo gerado', `Salvo em: ${uri}`);
            }
          }

          await repository.limparProdutosEmFalta(faltas.map((f) => f.id));
          setFaltas([]);
        } catch (erro) {
          alertar('Erro ao gerar relatório de faltas', erro instanceof Error ? erro.message : 'Tente novamente.');
        } finally {
          setGerandoFaltas(false);
        }
      },
      { textoConfirmar: 'Gerar e limpar', destrutivo: true }
    );
  };

  // Só é "a comprar" o que não tem NENHUMA unidade na farmácia: qualquer
  // estoque em outro cadastro do mesmo nome ou em outra marca equivalente
  // já tira da lista (pedido do gestor em 29/09/2026 — antes precisava
  // cobrir 7 dias de giro). Espelha o WhatsApp das 08h
  // (coletor/whatsapp_estoque_giro_alto_zerado.n8n.json, nó "Montar mensagem").
  const temEmOutroCadastro = (i: ItemEstoqueZeradoGiroAlto) => (i.cobertura?.estoqueIrmaos ?? 0) > 0;
  const zeradosAComprar = estoqueZeradoGiroAlto.filter((i) => !temEmOutroCadastro(i));
  const zeradosCobertos = estoqueZeradoGiroAlto.filter(temEmOutroCadastro);
  const faltasComIrmao = faltas.filter((f) => !f.temSaldoEstoque && f.irmaosEmEstoque.length > 0).length;

  const renderItemZerado = (item: ItemEstoqueZeradoGiroAlto) => {
    const selecionado = selecionados.includes(item.codigoProduto);
    return (
      <Pressable
        key={item.codigoProduto}
        style={styles.linhaClassificado}
        onPress={() => alternarSelecao(item.codigoProduto)}
        hitSlop={4}
      >
        <Ionicons
          name={selecionado ? 'checkbox' : 'square-outline'}
          size={22}
          color={selecionado ? colors.navy : colors.textMuted}
        />
        <View style={styles.flex1}>
          <Text style={styles.itemNome} numberOfLines={2}>{item.nomeProduto}</Text>
          <Text style={styles.itemSubinfo}>
            cód. {item.codigoProduto} · {item.quantidadeVendida30d} vendidos em 30d
          </Text>
          {item.cobertura && (
            <Text style={item.cobertura.coberto ? styles.itemCoberto : styles.itemCobertoParcial}>
              {item.cobertura.coberto ? 'Coberto por outro cadastro: ' : 'Outro cadastro em estoque, mas pouco: '}
              {textoCobertura(item.cobertura)}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🛒 Sugestão de compras</Text>
      <Text style={styles.subtitle}>
        Calcula quanto repor por produto comparando estoque atual com a demanda média de venda recente.
      </Text>

      <Card style={styles.cardDestaque}>
        <Pressable style={styles.itemHeaderRow} onPress={() => setMostrarEstoqueZeradoGiroAlto((v) => !v)}>
          <Ionicons name="flame" size={18} color={colors.red} />
          <Text style={[styles.cardTitulo, styles.cardTituloDestaque, styles.flex1]}>
            Estoque zerado — giro alto (
            {carregandoEstoqueZeradoGiroAlto
              ? '...'
              : `${zeradosAComprar.length}${zeradosCobertos.length > 0 ? ` · ${zeradosCobertos.length} cobertos` : ''}`}
            )
          </Text>
          <Ionicons name={mostrarEstoqueZeradoGiroAlto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.red} />
        </Pressable>
        <Text style={styles.itemSubinfo}>
          Mesma lista que sai no WhatsApp da farmácia todo dia às 08h: produtos entre os que mais vendem, zerados agora.
          Os que têm o produto em outro cadastro ou outra marca equivalente, com qualquer estoque, ficam num grupo à parte.
        </Text>
        {mostrarEstoqueZeradoGiroAlto && (
          carregandoEstoqueZeradoGiroAlto ? (
            <ActivityIndicator style={styles.espacadoCima} />
          ) : estoqueZeradoGiroAlto.length === 0 ? (
            <Text style={[styles.empty, styles.espacadoCima]}>Nenhum produto de giro alto zerado agora.</Text>
          ) : (
            <>
              <Text style={[styles.resumoLinha, styles.espacadoCima]}>
                Toque pra selecionar e classificar quem não vai ser reposto.
              </Text>
              {zeradosAComprar.length === 0 ? (
                <Text style={styles.empty}>Todos os zerados têm o produto em outro cadastro ou marca equivalente.</Text>
              ) : (
                zeradosAComprar.map(renderItemZerado)
              )}
              {zeradosCobertos.length > 0 && (
                <>
                  <Pressable
                    style={[styles.itemHeaderRow, styles.espacadoCima]}
                    onPress={() => setMostrarCobertos((v) => !v)}
                  >
                    <Text style={[styles.cardTitulo, styles.flex1]}>
                      Têm em outro cadastro ou marca ({zeradosCobertos.length})
                    </Text>
                    <Ionicons
                      name={mostrarCobertos ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                  {mostrarCobertos && zeradosCobertos.map(renderItemZerado)}
                </>
              )}
            </>
          )
        )}
      </Card>

      {selecionados.length > 0 && (
        <Card style={styles.cardSelecao}>
          <Text style={styles.cardTitulo}>{selecionados.length} selecionado(s)</Text>
          <Text style={styles.grupoHint}>
            Classificar como (some da lista até você reincluir em "Classificados"):
          </Text>
          <View style={styles.grupoGrid}>
            {ORDEM_MOTIVOS_CLASSIFICACAO.filter((m) => m !== 'outros').map((motivo) => (
              <Pressable
                key={motivo}
                style={styles.chip}
                onPress={() => classificarSelecionados(motivo)}
                disabled={classificando}
              >
                <Text style={styles.chipTexto}>{MOTIVO_CLASSIFICACAO_LABEL[motivo]}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.chip} onPress={() => setModalOutrosAberto(true)} disabled={classificando}>
              <Text style={styles.chipTexto}>{MOTIVO_CLASSIFICACAO_LABEL.outros}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setSelecionados([])} hitSlop={8} style={styles.espacadoCima}>
            <Text style={styles.linkAcao}>Limpar seleção</Text>
          </Pressable>
        </Card>
      )}

      <Card>
        <Text style={styles.cardTitulo}>Faltas registradas</Text>
        {carregandoFaltas ? (
          <ActivityIndicator />
        ) : faltas.length === 0 ? (
          <Text style={styles.empty}>Nenhuma falta registrada agora.</Text>
        ) : (
          <>
            <Text style={styles.resumoLinha}>
              {faltas.length} produto(s) reportado(s) em falta
              {faltas.some((f) => f.temSaldoEstoque)
                ? ` · ${faltas.filter((f) => f.temSaldoEstoque).length} são ruptura de gôndola (não entra na compra)`
                : ''}
              {faltasComIrmao > 0
                ? ` · ${faltasComIrmao} já têm o produto em estoque sob outro cadastro (coluna no relatório)`
                : ''}
            </Text>
            <Pressable style={styles.botaoSecundario} onPress={gerarRelatorioFaltasEExportar} disabled={gerandoFaltas}>
              {gerandoFaltas ? (
                <ActivityIndicator color={colors.navy} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                  <Text style={styles.botaoSecundarioTexto}>Gerar relatório e limpar</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.aviso}>
              Gera o XLSX (separado por fornecedor, ruptura de gôndola numa aba à parte) e apaga as faltas da lista —
              some daqui e da aba Produtos em falta. Não dá pra desfazer.
            </Text>
          </>
        )}
      </Card>

      <Card>
        <Pressable style={styles.itemHeaderRow} onPress={() => setMostrarClassificados((v) => !v)}>
          <Text style={[styles.cardTitulo, styles.flex1]}>
            Classificados ({carregandoClassificacoes ? '...' : classificacoes.length})
          </Text>
          <Ionicons name={mostrarClassificados ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </Pressable>
        {mostrarClassificados && (
          classificacoes.length === 0 ? (
            <Text style={[styles.empty, styles.espacadoCima]}>Nenhum item classificado ainda.</Text>
          ) : (
            classificacoes.map((c) => (
              <View key={c.id} style={styles.linhaClassificado}>
                <View style={styles.flex1}>
                  <Text style={styles.itemNome} numberOfLines={1}>{c.nomeProduto}</Text>
                  <Text style={styles.itemSubinfo}>
                    {MOTIVO_CLASSIFICACAO_LABEL[c.motivo]}
                    {c.observacao ? ` · ${c.observacao}` : ''} · {c.nomeClassificadoPor}
                  </Text>
                </View>
                <Pressable onPress={() => reincluir(c.codigoProduto)} hitSlop={8}>
                  <Text style={styles.linkAcao}>Reincluir</Text>
                </Pressable>
              </View>
            ))
          )
        )}
      </Card>

      <Card>
        <Pressable style={styles.itemHeaderRow} onPress={() => setMostrarPendentes((v) => !v)}>
          <Text style={[styles.cardTitulo, styles.flex1]}>Já pedidos, aguardando chegada ({pedidosPendentes.length})</Text>
          <Ionicons name={mostrarPendentes ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </Pressable>
        {mostrarPendentes &&
          (pedidosPendentes.length === 0 ? (
            <Text style={[styles.empty, styles.espacadoCima]}>
              Nenhum. Na sugestão, abra o item e toque em "Já pedi" pra ele não ser sugerido de novo até chegar.
            </Text>
          ) : (
            pedidosPendentes.map((p) => (
              <View key={p.codigoProduto} style={styles.linhaClassificado}>
                <View style={styles.flex1}>
                  <Text style={styles.itemNome} numberOfLines={1}>{p.nomeProduto}</Text>
                  <Text style={styles.itemSubinfo}>
                    {p.quantidade} un. · previsão {formatDateBR(p.previsaoChegada)}
                  </Text>
                </View>
                <Pressable onPress={() => desfazerJaPedi(p.codigoProduto)} hitSlop={8}>
                  <Text style={styles.linkAcao}>Desfazer</Text>
                </Pressable>
              </View>
            ))
          ))}
      </Card>

      <Card>
        <Text style={styles.cardTitulo}>Parâmetros</Text>
        <Text style={styles.campoLabel}>Fórmula</Text>
        <View style={styles.grupoGrid}>
          {(
            [
              ['inteligente', 'Inteligente (recomendada)'],
              ['simples', 'Simples'],
            ] as [FormulaCompra, string][]
          ).map(([valor, rotulo]) => (
            <Pressable key={valor} style={[styles.chip, formula === valor && styles.chipAtivo]} onPress={() => setFormula(valor)}>
              <Text style={[styles.chipTexto, formula === valor && styles.chipTextoAtivo]}>{rotulo}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.explicacaoParametro}>
          {formula === 'inteligente'
            ? 'Parte da mesma conta da simples e ajusta produto a produto: colchão maior pra quem vende de forma irregular (mais ainda na curva A), tendência das últimas 2 semanas, +20% pra produto em campanha aprovada e desconta o que você marcou como "já pedi".'
            : 'Venda média do período × (segurança + cobertura) − estoque atual, igual pra todo produto.'}
        </Text>
        <View style={styles.linhaDoisCampos}>
          <View style={styles.campoMetade}>
            <Text style={styles.campoLabel}>Estoque de segurança (dias)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={diasSeguranca} onChangeText={setDiasSeguranca} />
          </View>
          <View style={styles.campoMetade}>
            <Text style={styles.campoLabel}>Cobertura adicional (dias)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={diasCobertura} onChangeText={setDiasCobertura} />
          </View>
        </View>
        <Text style={styles.explicacaoParametro}>
          <Text style={styles.explicacaoDestaque}>Estoque de segurança: </Text>
          colchão mínimo mantido pra não faltar produto entre uma compra e outra, cobrindo atrasos de entrega ou picos de
          venda.
        </Text>
        <Text style={styles.explicacaoParametro}>
          <Text style={styles.explicacaoDestaque}>Cobertura adicional: </Text>
          dias além do estoque de segurança que a compra sugerida também repõe, espaçando o intervalo até a próxima
          reposição.
        </Text>

        <View style={styles.campoMetade}>
          <Text style={styles.campoLabel}>Base de vendas p/ cálculo (dias)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={diasBaseVenda} onChangeText={setDiasBaseVenda} />
        </View>
        <Text style={styles.explicacaoParametro}>
          <Text style={styles.explicacaoDestaque}>Base de vendas: </Text>
          janela de dias usada pra calcular a demanda média diária de cada produto (padrão 30).
        </Text>

        <Text style={[styles.campoLabel, styles.grupoLabelEspacado]}>Grupos</Text>
        <Text style={styles.grupoHint}>
          Toque pra selecionar, toque de novo pra tirar — dá pra marcar mais de um. Nenhum selecionado = todos.
        </Text>
        <View style={styles.grupoGrid}>
          <Pressable
            style={[styles.chip, macroGruposSelecionados.length === 0 && styles.chipAtivo]}
            onPress={() => setMacroGruposSelecionados([])}
          >
            <Text style={[styles.chipTexto, macroGruposSelecionados.length === 0 && styles.chipTextoAtivo]}>Todos</Text>
          </Pressable>
          {GRUPOS_SELECIONAVEIS.map((grupo) => (
            <Pressable
              key={grupo}
              style={[styles.chip, macroGruposSelecionados.includes(grupo) && styles.chipAtivo]}
              onPress={() => alternarMacroGrupo(grupo)}
            >
              <Text style={[styles.chipTexto, macroGruposSelecionados.includes(grupo) && styles.chipTextoAtivo]}>
                {MACRO_GRUPO_LABEL[grupo]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.aviso}>
          A compra sugerida repõe até {Number(diasSeguranca || '0') + Number(diasCobertura || '0')} dias de estoque, com base
          na venda dos últimos {Number(diasBaseVenda || '0') || 30} dias.
        </Text>

        <Pressable style={styles.botaoPrimario} onPress={gerar} disabled={gerando}>
          {gerando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="calculator-outline" size={18} color={colors.white} />
              <Text style={styles.botaoTexto}>Gerar sugestão</Text>
            </>
          )}
        </Pressable>
      </Card>

      {itens !== null && itens.length === 0 && (
        <Card>
          <Text style={styles.empty}>
            Nenhum produto precisa de reposição com esses parâmetros — o estoque atual já cobre o período configurado.
          </Text>
        </Card>
      )}

      {itens !== null && itens.length > 0 && (
        <>
          <Card>
            <Text style={styles.cardTitulo}>Resumo</Text>
            <Text style={styles.resumoLinha}>{totalItens} produtos · custo estimado {formatBRL(valorTotal)}</Text>

            <Pressable style={styles.botaoSecundario} onPress={exportarXlsx} disabled={exportando}>
              {exportando ? (
                <ActivityIndicator color={colors.navy} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                  <Text style={styles.botaoSecundarioTexto}>Exportar XLSX</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.aviso}>
              O arquivo sai com uma aba "Todos" (visão completa) e uma aba por fornecedor, só com o essencial pra
              cotação/pedido — pode mandar a aba direto pro fornecedor. Fornecedor e fator de compra vêm da compra mais
              recente de cada produto — sem prazo de entrega/última cotação, a Trier não expõe esses campos na integração.
            </Text>
          </Card>

          <Text style={styles.sectionTitulo}>Produtos a repor</Text>
          {itens.map((item) => {
            const aberto = expandido === item.codigoProduto;
            const selecionado = selecionados.includes(item.codigoProduto);
            return (
              <Card key={item.codigoProduto}>
                <Pressable style={styles.itemHeaderRow} onPress={() => alternarExpandido(item.codigoProduto)}>
                  <Pressable onPress={() => alternarSelecao(item.codigoProduto)} hitSlop={8}>
                    <Ionicons
                      name={selecionado ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selecionado ? colors.navy : colors.textMuted}
                    />
                  </Pressable>
                  <View style={styles.itemHeaderTexto}>
                    <Text style={styles.itemNome} numberOfLines={2}>{item.nomeProduto}</Text>
                    <Text style={styles.itemSubinfo}>
                      Estoque {item.estoqueAtual} · demanda {item.demandaMediaDiaria.toFixed(2)}/dia
                      {item.fornecedorSugerido ? ` · ${item.fornecedorSugerido}` : ''}
                    </Text>
                    {item.cobertura && (
                      <Text style={item.cobertura.coberto ? styles.itemCoberto : styles.itemCobertoParcial}>
                        {item.cobertura.coberto ? 'Já coberto por outro cadastro: ' : 'Outro cadastro em estoque, mas pouco: '}
                        {textoCobertura(item.cobertura)}
                      </Text>
                    )}
                    {item.detalhe && explicarQuantidade(item.detalhe) !== '' && (
                      <Text style={styles.itemPorque}>Por quê: {explicarQuantidade(item.detalhe)}</Text>
                    )}
                    {item.alternativaMaisBarata && (
                      <Text style={styles.itemAlternativa}>
                        Outra marca mais barata: {item.alternativaMaisBarata.nome} ·{' '}
                        {formatBRL(item.alternativaMaisBarata.custoMedio)} (
                        {formatBRL(item.alternativaMaisBarata.economiaUnitaria)} a menos por un.
                        {item.quantidadeSugerida > 0
                          ? `, ${formatBRL(item.alternativaMaisBarata.economiaUnitaria * item.quantidadeSugerida)} nesta compra`
                          : ''}
                        )
                      </Text>
                    )}
                  </View>
                </Pressable>

                <View style={styles.linhaQuantidade}>
                  <Text style={styles.itemLabel}>Comprar (fator {item.fatorCompra})</Text>
                  <TextInput
                    style={styles.inputQuantidade}
                    keyboardType="numeric"
                    value={String(item.quantidadeSugerida)}
                    onChangeText={(texto) => ajustarQuantidade(item.codigoProduto, texto)}
                  />
                </View>

                {aberto && (
                  <View style={styles.painelExpandido}>
                    <Text style={styles.campoLabel}>Código / código de barras</Text>
                    <Text style={styles.campoSomenteLeitura}>
                      {item.codigoProduto} · {item.codigoBarras}
                    </Text>

                    <View style={styles.linhaDoisCampos}>
                      <View style={styles.campoMetade}>
                        <Text style={styles.campoLabel}>Estoque mínimo / alvo</Text>
                        <Text style={styles.campoSomenteLeitura}>
                          {item.estoqueMinimo.toFixed(1)} / {item.estoqueAlvo.toFixed(1)}
                        </Text>
                      </View>
                      <View style={styles.campoMetade}>
                        <Text style={styles.campoLabel}>Margem atual</Text>
                        <Text style={styles.campoSomenteLeitura}>{item.margemAtualPct.toFixed(1)}%</Text>
                      </View>
                    </View>

                    <View style={styles.linhaDoisCampos}>
                      <View style={styles.campoMetade}>
                        <Text style={styles.campoLabel}>Custo médio</Text>
                        <Text style={styles.campoSomenteLeitura}>{formatBRL(item.custoMedio)}</Text>
                      </View>
                      <View style={styles.campoMetade}>
                        <Text style={styles.campoLabel}>Preço de venda</Text>
                        <Text style={styles.campoSomenteLeitura}>{formatBRL(item.precoVenda)}</Text>
                      </View>
                    </View>

                    <Pressable style={styles.botaoJaPedi} onPress={() => marcarJaPedi(item)}>
                      <Ionicons name="checkmark-done-outline" size={16} color={colors.navy} />
                      <Text style={styles.botaoSecundarioTexto}>Já pedi {item.quantidadeSugerida} un.</Text>
                    </Pressable>

                    {item.fornecedorMaisBarato && item.precoMaisBarato !== null && (
                      <>
                        <Text style={styles.campoLabel}>Fornecedor mais barato (últimos 12 meses)</Text>
                        <Text style={styles.campoSomenteLeitura}>
                          {item.fornecedorMaisBarato} · {formatBRL(item.precoMaisBarato)}
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}

      <Modal visible={modalOutrosAberto} transparent animationType="fade" onRequestClose={() => setModalOutrosAberto(false)}>
        <Pressable style={styles.modalFundo} onPress={() => setModalOutrosAberto(false)}>
          <Pressable style={styles.modalCartao} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cardTitulo}>Classificar como "Outros"</Text>
            <Text style={styles.grupoHint}>Observação (opcional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultilinha]}
              value={observacaoOutros}
              onChangeText={setObservacaoOutros}
              placeholder="Ex.: fornecedor sem previsão de entrega"
              multiline
              numberOfLines={3}
            />
            <View style={styles.linhaDoisCampos}>
              <Pressable style={[styles.botaoSecundario, styles.flex1]} onPress={() => setModalOutrosAberto(false)}>
                <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.botaoPrimario, styles.flex1]} onPress={confirmarOutros}>
                <Text style={styles.botaoTexto}>Confirmar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  empty: { color: colors.textSecondary },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  resumoLinha: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
  itemHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemHeaderTexto: { flex: 1 },
  itemNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  itemSubinfo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemCoberto: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 2 },
  itemPorque: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  botaoJaPedi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  itemAlternativa: { fontSize: 12, color: colors.navy, fontWeight: '600', marginTop: 2 },
  itemCobertoParcial: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  linhaQuantidade: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  itemLabel: { fontSize: 12, color: colors.textSecondary },
  inputQuantidade: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
    width: 64,
    textAlign: 'center',
  },
  painelExpandido: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  campoLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  campoSomenteLeitura: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  grupoLabelEspacado: { marginTop: 14 },
  grupoHint: { fontSize: 11, color: colors.textMuted, marginBottom: 8, lineHeight: 15 },
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
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
  },
  linhaDoisCampos: { flexDirection: 'row', gap: 10 },
  campoMetade: { flex: 1, marginTop: 10 },
  explicacaoParametro: { fontSize: 11, color: colors.textMuted, marginTop: 8, lineHeight: 15 },
  explicacaoDestaque: { fontWeight: '700', color: colors.textSecondary },
  botaoPrimario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 14,
  },
  botaoTexto: { color: colors.white, fontWeight: '700', fontSize: 14 },
  botaoSecundario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  botaoSecundarioTexto: { color: colors.navy, fontWeight: '700', fontSize: 14 },
  aviso: { fontSize: 11, color: colors.textMuted, marginTop: 10, lineHeight: 15 },
  flex1: { flex: 1 },
  espacadoCima: { marginTop: 10 },
  linkAcao: { fontSize: 12, color: colors.navy, fontWeight: '700' },
  linhaClassificado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardSelecao: { borderWidth: 1.5, borderColor: colors.navy },
  cardDestaque: { borderWidth: 1.5, borderColor: colors.red, backgroundColor: '#FFF5F5' },
  cardTituloDestaque: { color: colors.red },
  inputMultilinha: { minHeight: 70, textAlignVertical: 'top', marginTop: 6, marginBottom: 12 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalCartao: { backgroundColor: colors.white, borderRadius: 16, padding: 18, width: '88%', maxWidth: 360 },
});
