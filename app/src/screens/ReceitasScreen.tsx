import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { alertar } from '../lib/alert';
import { repository } from '../data';
import { Card } from '../components/Card';
import { LoadingFarmacia } from '../components/LoadingFarmacia';
import { colors } from '../theme/colors';
import { formatDateBR } from '../lib/format';
import { NOMES_MES } from '../lib/metas';
import { cacheGet, cacheSet } from '../lib/cache';
import { TIPO_RECEITA_LABEL } from '../data/mock/seed';
import { VendaReceitaPendente } from '../types/domain';

const TODOS = 'todos';

function labelMes(mesChave: string): string {
  const [anoStr, mesStr] = mesChave.split('-');
  return `${NOMES_MES[Number(mesStr) - 1]}/${anoStr}`;
}

export function ReceitasScreen() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<VendaReceitaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capturandoId, setCapturandoId] = useState<string | null>(null);
  const [filtroVendedor, setFiltroVendedor] = useState<number | typeof TODOS>(TODOS);
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'anexada' | null>(null);
  const [filtroMes, setFiltroMes] = useState<string | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const dados = await repository.getVendasComReceita(profile);
    setItens(dados);
    cacheSet(`receitas:${profile.id}`, dados);
  }, [profile]);

  // Stale-while-revalidate (ver lib/cache.ts): mostra o último
  // resultado da sessão na hora, sem spinner, e atualiza por trás.
  useEffect(() => {
    if (!profile) return;
    const cacheado = cacheGet<VendaReceitaPendente[]>(`receitas:${profile.id}`);
    if (cacheado) {
      setItens(cacheado);
      setLoading(false);
    } else {
      setLoading(true);
    }
    load().finally(() => setLoading(false));
  }, [load, profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const capturarFoto = async (item: VendaReceitaPendente) => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      alertar('Permissão necessária', 'Precisamos de acesso à câmera para fotografar a receita.');
      return;
    }

    setCapturandoId(item.itemId);
    try {
      const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (resultado.canceled) return;

      const uri = resultado.assets?.[0]?.uri;
      if (!uri) return;

      await repository.anexarReceita(item.itemId, { tipo: item.tipoReceita, fotoUri: uri });
      await load();
      alertar('Receita anexada', 'Foto salva com sucesso.');
    } catch (erro) {
      alertar('Erro ao anexar receita', erro instanceof Error ? erro.message : 'Tente novamente.');
    } finally {
      setCapturandoId(null);
    }
  };

  const vendedoresNaLista = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const item of itens) mapa.set(item.codigoVendedor, item.nomeVendedor);
    return Array.from(mapa.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [itens]);

  const mesesNaLista = useMemo(() => {
    const set = new Set<string>();
    for (const item of itens) set.add(item.dataVenda.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [itens]);

  const itensFiltrados = itens.filter((i) => {
    if (profile?.role === 'gestor' && filtroVendedor !== TODOS && i.codigoVendedor !== filtroVendedor) return false;
    if (filtroStatus === 'pendente' && i.receitaAnexada) return false;
    if (filtroStatus === 'anexada' && !i.receitaAnexada) return false;
    if (filtroMes && i.dataVenda.slice(0, 7) !== filtroMes) return false;
    return true;
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingFarmacia />
      </View>
    );
  }

  const pendentes = itensFiltrados.filter((i) => !i.receitaAnexada).length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>💊 Produtos com receita</Text>
      <Text style={styles.subtitle}>
        {itensFiltrados.length} vendas de produtos controlados · {pendentes} com receita pendente
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroScroll} contentContainerStyle={styles.filtroRow}>
        <Pressable
          style={[styles.filtroChip, filtroStatus === 'pendente' && styles.filtroChipAtivo]}
          onPress={() => setFiltroStatus((atual) => (atual === 'pendente' ? null : 'pendente'))}
        >
          <Text style={[styles.filtroChipTexto, filtroStatus === 'pendente' && styles.filtroChipTextoAtivo]}>
            Sem receita
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filtroChip, filtroStatus === 'anexada' && styles.filtroChipAtivo]}
          onPress={() => setFiltroStatus((atual) => (atual === 'anexada' ? null : 'anexada'))}
        >
          <Text style={[styles.filtroChipTexto, filtroStatus === 'anexada' && styles.filtroChipTextoAtivo]}>
            Com receita
          </Text>
        </Pressable>
      </ScrollView>

      {mesesNaLista.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroScroll} contentContainerStyle={styles.filtroRow}>
          {mesesNaLista.map((mesChave) => (
            <Pressable
              key={mesChave}
              style={[styles.filtroChip, filtroMes === mesChave && styles.filtroChipAtivo]}
              onPress={() => setFiltroMes((atual) => (atual === mesChave ? null : mesChave))}
            >
              <Text style={[styles.filtroChipTexto, filtroMes === mesChave && styles.filtroChipTextoAtivo]}>
                {labelMes(mesChave)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {profile?.role === 'gestor' && vendedoresNaLista.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroScroll} contentContainerStyle={styles.filtroRow}>
          <Pressable
            style={[styles.filtroChip, filtroVendedor === TODOS && styles.filtroChipAtivo]}
            onPress={() => setFiltroVendedor(TODOS)}
          >
            <Text style={[styles.filtroChipTexto, filtroVendedor === TODOS && styles.filtroChipTextoAtivo]}>
              Todos
            </Text>
          </Pressable>
          {vendedoresNaLista.map((v) => (
            <Pressable
              key={v.codigo}
              style={[styles.filtroChip, filtroVendedor === v.codigo && styles.filtroChipAtivo]}
              onPress={() => setFiltroVendedor(v.codigo)}
            >
              <Text style={[styles.filtroChipTexto, filtroVendedor === v.codigo && styles.filtroChipTextoAtivo]}>
                {v.nome}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {itensFiltrados.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nenhuma venda de produto controlado encontrada.</Text>
        </Card>
      ) : (
        itensFiltrados.map((item) => (
          <Card key={item.itemId} style={styles.cardCompacta}>
            {profile?.role === 'gestor' && (
              <View style={styles.vendedorTag}>
                <Text style={styles.vendedorTagTexto}>{item.nomeVendedor}</Text>
              </View>
            )}

            <View style={styles.linhaPrincipal}>
              <View style={styles.infoPrincipal}>
                <Text style={styles.produtoNome} numberOfLines={1}>
                  {item.nomeProduto}
                </Text>
                <Text style={styles.detalheLinha} numberOfLines={1}>
                  {TIPO_RECEITA_LABEL[item.tipoReceita]} · {item.nomeCliente}
                </Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusBadge,
                      styles.statusBadgeCompacta,
                      item.receitaAnexada ? styles.statusOk : styles.statusPendente,
                    ]}
                  >
                    <Text style={[styles.statusText, item.receitaAnexada ? styles.statusTextOk : styles.statusTextPendente]}>
                      {item.receitaAnexada ? 'Receita anexada' : 'Receita pendente'}
                    </Text>
                  </View>
                  <Text style={styles.dataLinha}>
                    {item.receitaAnexada
                      ? formatDateBR((item.receitaDataAnexo ?? item.dataVenda).slice(0, 10))
                      : `venda ${formatDateBR(item.dataVenda)}`}
                  </Text>
                </View>
              </View>

              <View style={styles.fotoWrap}>
                <Pressable
                  style={[styles.fotoBotao, item.receitaFotoUri && styles.fotoBotaoComFoto]}
                  onPress={() => (item.receitaFotoUri ? setFotoAmpliada(item.receitaFotoUri) : capturarFoto(item))}
                  disabled={capturandoId === item.itemId}
                >
                  {capturandoId === item.itemId ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : item.receitaFotoUri ? (
                    <Image source={{ uri: item.receitaFotoUri }} style={styles.fotoImagem} />
                  ) : (
                    <Ionicons name="camera" size={20} color={colors.white} />
                  )}
                </Pressable>
                {item.receitaFotoUri && (
                  <Pressable
                    style={styles.fotoRetomar}
                    onPress={() => capturarFoto(item)}
                    disabled={capturandoId === item.itemId}
                    hitSlop={6}
                  >
                    <Ionicons name="camera" size={12} color={colors.white} />
                  </Pressable>
                )}
              </View>
            </View>
          </Card>
        ))
      )}

      {Platform.OS === 'web' && (
        <Text style={styles.webHint}>
          No navegador, o botão de câmera abre o seletor de arquivo/webcam do próprio browser.
        </Text>
      )}

      <Modal visible={fotoAmpliada != null} transparent animationType="fade" onRequestClose={() => setFotoAmpliada(null)}>
        <Pressable style={styles.modalFundo} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada ? <Image source={{ uri: fotoAmpliada }} style={styles.modalFoto} resizeMode="contain" /> : null}
          <Pressable style={styles.modalFechar} onPress={() => setFotoAmpliada(null)} hitSlop={8}>
            <Ionicons name="close" size={28} color={colors.white} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  empty: { color: colors.textSecondary },
  filtroScroll: { marginBottom: 12 },
  filtroRow: { gap: 8, paddingRight: 8 },
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
  vendedorTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.navy,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  vendedorTagTexto: { color: colors.white, fontSize: 11, fontWeight: '700' },
  cardCompacta: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  linhaPrincipal: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoPrincipal: { flex: 1 },
  produtoNome: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  detalheLinha: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  statusBadgeCompacta: { paddingHorizontal: 8, paddingVertical: 3 },
  dataLinha: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  statusOk: { backgroundColor: '#dcfce7' },
  statusPendente: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextOk: { color: colors.success },
  statusTextPendente: { color: colors.red },
  fotoWrap: { position: 'relative' },
  fotoBotao: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fotoBotaoComFoto: { backgroundColor: colors.background },
  fotoImagem: { width: 52, height: 52 },
  fotoRetomar: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  modalFoto: { width: '100%', height: '80%' },
  modalFechar: { position: 'absolute', top: 48, right: 20, padding: 8 },
});
