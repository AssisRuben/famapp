import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { alertar } from '../lib/alert';
import { repository } from '../data';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { formatDateBR } from '../lib/format';
import { TIPO_RECEITA_LABEL } from '../data/mock/seed';
import { VendaReceitaPendente } from '../types/domain';

const TODOS = 'todos';

export function ReceitasScreen() {
  const { profile } = useAuth();
  const [itens, setItens] = useState<VendaReceitaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capturandoId, setCapturandoId] = useState<string | null>(null);
  const [filtroVendedor, setFiltroVendedor] = useState<number | typeof TODOS>(TODOS);

  const load = useCallback(async () => {
    if (!profile) return;
    setItens(await repository.getVendasComReceita(profile));
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

  const itensFiltrados =
    profile?.role === 'gestor' && filtroVendedor !== TODOS
      ? itens.filter((i) => i.codigoVendedor === filtroVendedor)
      : itens;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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
          <Card key={item.itemId}>
            {profile?.role === 'gestor' && (
              <View style={styles.vendedorTag}>
                <Text style={styles.vendedorTagTexto}>{item.nomeVendedor}</Text>
              </View>
            )}

            <View style={styles.headerRow}>
              <Text style={styles.produtoNome}>{item.nomeProduto}</Text>
              <View style={[styles.statusBadge, item.receitaAnexada ? styles.statusOk : styles.statusPendente]}>
                <Text style={[styles.statusText, item.receitaAnexada ? styles.statusTextOk : styles.statusTextPendente]}>
                  {item.receitaAnexada ? 'Receita anexada' : 'Receita pendente'}
                </Text>
              </View>
            </View>

            <Text style={styles.tipoReceita}>{TIPO_RECEITA_LABEL[item.tipoReceita]}</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Cliente</Text>
              <Text style={styles.infoValor}>{item.nomeCliente}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Venda em</Text>
              <Text style={styles.infoValor}>{formatDateBR(item.dataVenda)}</Text>
            </View>

            {item.receitaAnexada && (
              <View style={styles.anexoBox}>
                {item.receitaFotoUri ? (
                  <Image source={{ uri: item.receitaFotoUri }} style={styles.anexoThumb} />
                ) : (
                  <Text style={styles.anexoIcone}>📄</Text>
                )}
                <View style={styles.anexoInfo}>
                  <Text style={styles.anexoTexto}>
                    Anexada em{' '}
                    {item.receitaDataAnexo
                      ? formatDateBR(item.receitaDataAnexo.slice(0, 10))
                      : '—'}
                  </Text>
                  <Text style={styles.anexoTexto}>{TIPO_RECEITA_LABEL[item.tipoReceita]}</Text>
                </View>
              </View>
            )}

            <Pressable
              style={styles.cameraButton}
              onPress={() => capturarFoto(item)}
              disabled={capturandoId === item.itemId}
            >
              {capturandoId === item.itemId ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Text style={styles.cameraIcone}>📷</Text>
                  <Text style={styles.cameraTexto}>
                    {item.receitaAnexada ? 'Tirar nova foto' : 'Fotografar receita'}
                  </Text>
                </>
              )}
            </Pressable>
          </Card>
        ))
      )}

      {Platform.OS === 'web' && (
        <Text style={styles.webHint}>
          No navegador, o botão de câmera abre o seletor de arquivo/webcam do próprio browser.
        </Text>
      )}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  produtoNome: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, flexShrink: 1, marginRight: 8 },
  tipoReceita: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusOk: { backgroundColor: '#dcfce7' },
  statusPendente: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextOk: { color: colors.success },
  statusTextPendente: { color: colors.red },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  infoLabel: { fontSize: 13, color: colors.textSecondary },
  infoValor: { fontSize: 13, color: colors.textPrimary, fontWeight: '500' },
  anexoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 10,
  },
  anexoThumb: { width: 44, height: 44, borderRadius: 8 },
  anexoIcone: { fontSize: 28, width: 44, textAlign: 'center' },
  anexoInfo: { flexShrink: 1 },
  anexoTexto: { fontSize: 12, color: colors.textSecondary },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 12,
    gap: 8,
  },
  cameraIcone: { fontSize: 16 },
  cameraTexto: { color: colors.white, fontWeight: '600', fontSize: 14 },
  webHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
});
