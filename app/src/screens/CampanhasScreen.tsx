import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { formatBRL, formatDateBR, todayISO } from '../lib/format';
import { alertar, confirmar } from '../lib/alert';
import { Campanha, CampanhaProduto, ProdutoElegibilidade } from '../types/domain';

type Modo = 'lista' | 'nova';

function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function CampanhasScreen() {
  const { profile } = useAuth();
  const [modo, setModo] = useState<Modo>('lista');

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);

  const [nome, setNome] = useState('');
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(somarDias(todayISO(), 7));
  const [margemMinima, setMargemMinima] = useState('20');
  const [descontoAlvo, setDescontoAlvo] = useState('15');
  const [quantidadeMaxima, setQuantidadeMaxima] = useState('10');
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<CampanhaProduto[]>([]);

  const carregarLista = useCallback(async () => {
    if (!profile) return;
    setLoadingLista(true);
    setCampanhas(await repository.getCampanhas(profile));
    setLoadingLista(false);
  }, [profile]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const gerarSugestao = async () => {
    if (!profile) return;
    const params = {
      margemMinimaPct: Number(margemMinima.replace(',', '.')) || 0,
      descontoAlvoPct: Number(descontoAlvo.replace(',', '.')) || 0,
      quantidadeMaxima: Number(quantidadeMaxima) || 10,
    };
    setGerando(true);
    try {
      const sugestoes = await repository.sugerirProdutosCampanha(profile, params);
      setItens(sugestoes.map((s) => mapearSugestaoParaItem(s, dataInicio, dataFim)));
    } catch (erro) {
      alertar('Erro ao gerar sugestão', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  const removerItem = (codigoProduto: number) => {
    setItens((atual) => atual.filter((i) => i.codigoProduto !== codigoProduto));
  };

  const ajustarPreco = (codigoProduto: number, texto: string) => {
    setItens((atual) =>
      atual.map((i) => {
        if (i.codigoProduto !== codigoProduto) return i;
        const precoPromocional = Number(texto.replace(',', '.')) || 0;
        return { ...i, precoPromocional };
      })
    );
  };

  const salvar = async () => {
    if (!nome.trim()) {
      alertar('Nome obrigatório', 'Dê um nome pra campanha antes de salvar.');
      return;
    }
    if (dataFim < dataInicio) {
      alertar('Datas inválidas', 'A data de fim precisa ser igual ou depois da data de início.');
      return;
    }
    if (itens.length === 0) {
      alertar('Sem produtos', 'Gere a sugestão e mantenha pelo menos 1 produto antes de salvar.');
      return;
    }

    setSalvando(true);
    try {
      await repository.salvarCampanha({ nome: nome.trim(), dataInicio, dataFim, produtos: itens });
      setModo('lista');
      setNome('');
      setItens([]);
      await carregarLista();
    } catch (erro) {
      alertar('Erro ao salvar campanha', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = (campanha: Campanha) => {
    confirmar(
      'Excluir campanha',
      `Excluir "${campanha.nome}"?`,
      async () => {
        try {
          await repository.excluirCampanha(campanha.id);
          await carregarLista();
        } catch (erro) {
          alertar('Erro ao excluir campanha', erro instanceof Error ? erro.message : 'Tente novamente.');
        }
      },
      { textoConfirmar: 'Excluir', destrutivo: true }
    );
  };

  if (modo === 'nova') {
    return (
      <ScrollView style={styles.container}>
        <Pressable style={styles.voltar} onPress={() => setModo('lista')} hitSlop={8}>
          <Ionicons name="arrow-back" size={18} color={colors.navy} />
          <Text style={styles.voltarTexto}>Campanhas</Text>
        </Pressable>

        <Text style={styles.title}>Nova campanha</Text>

        <Card>
          <Text style={styles.cardTitulo}>Cabeçalho</Text>
          <TextInput style={styles.input} placeholder="Nome da campanha" value={nome} onChangeText={setNome} />
          <View style={styles.linhaDatas}>
            <View style={styles.campoData}>
              <Text style={styles.rotulo}>Início</Text>
              <TextInput style={styles.input} value={dataInicio} onChangeText={setDataInicio} placeholder="AAAA-MM-DD" />
            </View>
            <View style={styles.campoData}>
              <Text style={styles.rotulo}>Fim</Text>
              <TextInput style={styles.input} value={dataFim} onChangeText={setDataFim} placeholder="AAAA-MM-DD" />
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitulo}>Critérios de sugestão</Text>
          <Text style={styles.rotulo}>Margem mínima (%)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={margemMinima} onChangeText={setMargemMinima} />
          <Text style={[styles.rotulo, styles.espacado]}>Desconto alvo (%)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={descontoAlvo} onChangeText={setDescontoAlvo} />
          <Text style={[styles.rotulo, styles.espacado]}>Quantidade máxima de produtos</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={quantidadeMaxima} onChangeText={setQuantidadeMaxima} />

          <Pressable style={styles.botaoGerar} onPress={gerarSugestao} disabled={gerando}>
            {gerando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoGerarTexto}>Gerar sugestão</Text>}
          </Pressable>
        </Card>

        {itens.length > 0 && (
          <>
            <Text style={styles.sectionTitulo}>Produtos sugeridos ({itens.length})</Text>
            {itens.map((item) => (
              <Card key={item.codigoProduto}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemNome} numberOfLines={2}>{item.nomeProduto}</Text>
                  <Pressable onPress={() => removerItem(item.codigoProduto)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </Pressable>
                </View>
                <View style={styles.itemLinha}>
                  <Text style={styles.itemLabel}>Preço regular</Text>
                  <Text style={styles.itemValor}>{formatBRL(item.precoRegular)}</Text>
                </View>
                <View style={styles.itemLinha}>
                  <Text style={styles.itemLabel}>% desconto</Text>
                  <Text style={styles.itemValor}>{item.percentualDesconto.toFixed(1)}%</Text>
                </View>
                <View style={styles.itemLinha}>
                  <Text style={styles.itemLabel}>Preço promocional</Text>
                  <TextInput
                    style={styles.inputPreco}
                    keyboardType="numeric"
                    value={String(item.precoPromocional)}
                    onChangeText={(texto) => ajustarPreco(item.codigoProduto, texto)}
                  />
                </View>
              </Card>
            ))}

            <Pressable style={styles.botaoSalvar} onPress={salvar} disabled={salvando}>
              {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoGerarTexto}>Salvar campanha</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>📢 Promoções avulsas</Text>
      <Text style={styles.subtitle}>
        Promoções avulsas fora do encarte — sugeridas por margem, estoque e venda recente.
      </Text>

      <Pressable style={styles.botaoNova} onPress={() => setModo('nova')}>
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.botaoGerarTexto}>Nova campanha</Text>
      </Pressable>

      {loadingLista ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : campanhas.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nenhuma campanha criada ainda.</Text>
        </Card>
      ) : (
        campanhas.map((campanha) => {
          const totalCartazes = campanha.produtos.reduce((acc, p) => acc + p.quantidadeCartazes, 0);
          return (
            <Card key={campanha.id}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemNome}>{campanha.nome}</Text>
                <Pressable onPress={() => excluir(campanha)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.red} />
                </Pressable>
              </View>
              <Text style={styles.campanhaPeriodo}>
                {formatDateBR(campanha.dataInicio)} a {formatDateBR(campanha.dataFim)}
              </Text>
              <Text style={styles.campanhaResumo}>
                {campanha.produtos.length} produto(s) · {totalCartazes} cartaz(es)
              </Text>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

function mapearSugestaoParaItem(sugestao: ProdutoElegibilidade, dataInicio: string, dataFim: string): CampanhaProduto {
  return {
    codigoProduto: sugestao.produto.codigo,
    codigoBarras: sugestao.produto.codigoBarras,
    nomeProduto: sugestao.produto.nome,
    precoRegular: sugestao.produto.precoVenda,
    precoPromocional: sugestao.precoSugerido,
    percentualDesconto: sugestao.percentualDescontoSugerido,
    quantidadeCartazes: 1,
    dataInicio,
    dataFim,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  voltarTexto: { color: colors.navy, fontWeight: '600', fontSize: 14 },
  botaoNova: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  botaoGerarTexto: { color: colors.white, fontWeight: '700', fontSize: 14 },
  empty: { color: colors.textSecondary },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  itemNome: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  campanhaPeriodo: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  campanhaResumo: { fontSize: 12, color: colors.textMuted },
  cardTitulo: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  rotulo: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  espacado: { marginTop: 10 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  linhaDatas: { flexDirection: 'row', gap: 10, marginTop: 4 },
  campoData: { flex: 1 },
  botaoGerar: { backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  sectionTitulo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 4, marginBottom: 8 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  itemLabel: { fontSize: 13, color: colors.textSecondary },
  itemValor: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  inputPreco: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 13,
    color: colors.textPrimary,
    width: 90,
    textAlign: 'right',
  },
  botaoSalvar: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4, marginBottom: 24 },
});
