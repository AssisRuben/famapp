import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { formatBRL } from '../lib/format';
import { gerarCsvSugestaoCompras } from '../lib/comprasCsv';
import { baixarArquivoTextoNoWeb } from '../lib/downloadWeb';
import { alertar } from '../lib/alert';
import { SugestaoCompra } from '../types/domain';

export function ComprasScreen() {
  const { profile } = useAuth();
  const [diasSeguranca, setDiasSeguranca] = useState('7');
  const [diasCobertura, setDiasCobertura] = useState('15');
  const [diasBaseVenda, setDiasBaseVenda] = useState('30');
  const [itens, setItens] = useState<SugestaoCompra[] | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const gerar = async () => {
    if (!profile) return;
    setGerando(true);
    try {
      const params = {
        diasSeguranca: Math.max(0, Number(diasSeguranca.replace(/\D/g, '')) || 0),
        diasCobertura: Math.max(0, Number(diasCobertura.replace(/\D/g, '')) || 0),
        diasBaseVenda: Math.max(1, Number(diasBaseVenda.replace(/\D/g, '')) || 30),
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

  const alternarExpandido = (codigoProduto: number) => {
    setExpandido((atual) => (atual === codigoProduto ? null : codigoProduto));
  };

  const ajustarQuantidade = (codigoProduto: number, texto: string) => {
    const quantidade = Math.max(0, Number(texto.replace(/\D/g, '')) || 0);
    setItens((atual) => atual?.map((i) => (i.codigoProduto === codigoProduto ? { ...i, quantidadeSugerida: quantidade } : i)) ?? null);
  };

  const totalItens = itens?.length ?? 0;
  const valorTotal = (itens ?? []).reduce((acc, i) => acc + i.quantidadeSugerida * i.custoMedio, 0);

  const exportarCsv = async () => {
    if (!itens || itens.length === 0) return;
    setExportando(true);
    try {
      const conteudo = gerarCsvSugestaoCompras(itens);
      const nomeArquivo = `lista-compras-${new Date().toISOString().slice(0, 10)}.csv`;

      if (Platform.OS === 'web') {
        baixarArquivoTextoNoWeb(nomeArquivo, conteudo);
        return;
      }

      const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
      await FileSystem.writeAsStringAsync(uri, conteudo);

      const podeCompartilhar = await Sharing.isAvailableAsync();
      if (podeCompartilhar) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Exportar lista de compras' });
      } else {
        alertar('Arquivo gerado', `Salvo em: ${uri}`);
      }
    } catch (erro) {
      alertar('Erro ao exportar CSV', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🛒 Sugestão de compras</Text>
      <Text style={styles.subtitle}>
        Calcula quanto repor por produto comparando estoque atual com a demanda média de venda recente.
      </Text>

      <Card>
        <Text style={styles.cardTitulo}>Parâmetros</Text>
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
          <Text style={styles.sectionTitulo}>Produtos a repor</Text>
          {itens.map((item) => {
            const aberto = expandido === item.codigoProduto;
            return (
              <Card key={item.codigoProduto}>
                <Pressable style={styles.itemHeaderRow} onPress={() => alternarExpandido(item.codigoProduto)}>
                  <View style={styles.itemHeaderTexto}>
                    <Text style={styles.itemNome} numberOfLines={2}>{item.nomeProduto}</Text>
                    <Text style={styles.itemSubinfo}>
                      Estoque {item.estoqueAtual} · demanda {item.demandaMediaDiaria.toFixed(2)}/dia
                      {item.fornecedorSugerido ? ` · ${item.fornecedorSugerido}` : ''}
                    </Text>
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
                  </View>
                )}
              </Card>
            );
          })}

          <Card>
            <Text style={styles.cardTitulo}>Resumo</Text>
            <Text style={styles.resumoLinha}>{totalItens} produtos · custo estimado {formatBRL(valorTotal)}</Text>

            <Pressable style={styles.botaoSecundario} onPress={exportarCsv} disabled={exportando}>
              {exportando ? (
                <ActivityIndicator color={colors.navy} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colors.navy} />
                  <Text style={styles.botaoSecundarioTexto}>Exportar CSV</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.aviso}>
              Fornecedor e fator de compra vêm da compra mais recente de cada produto — sem prazo de entrega/última cotação,
              a Trier não expõe esses campos na integração.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
