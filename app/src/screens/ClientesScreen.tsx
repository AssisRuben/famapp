import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { repository } from '../data';
import { ClienteInatividade } from '../types/domain';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { colors } from '../theme/colors';
import { formatDateBR } from '../lib/format';

function mensagemReativacao(cliente: ClienteInatividade): string {
  const ultima = cliente.ultimaCompra ? formatDateBR(cliente.ultimaCompra) : null;
  const referenciaUltimaCompra = ultima
    ? `sua última compra na Farmácias Conviva foi em ${ultima}`
    : 'ainda não vimos você por aqui';
  return `Olá, ${cliente.nome}! Aqui é da Farmácias Conviva 💊 Notamos que ${referenciaUltimaCompra} e sentimos sua falta. Temos novidades e condições especiais pra você — podemos ajudar em algo?`;
}

export function ClientesScreen() {
  const { profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteInatividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setClientes(await repository.getClientesInatividade(profile));
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const inativos = clientes.filter((c) => c.inativo).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{profile?.role === 'gestor' ? 'Clientes em potencial' : 'Meus clientes em potencial'}</Text>
      <Text style={styles.subtitle}>
        {clientes.length} clientes · {inativos} inativos (sem compra há mais de 60 dias)
      </Text>

      <FlatList
        data={clientes.slice().sort((a, b) => (b.diasSemComprar ?? -1) - (a.diasSemComprar ?? -1))}
        keyExtractor={(item) => String(item.codigo)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.nome}>{item.nome}</Text>
              {profile?.role === 'gestor' && item.nomeVendedor && (
                <View style={styles.vendedorTag}>
                  <Text style={styles.vendedorTagTexto}>{item.nomeVendedor}</Text>
                </View>
              )}
              <Text style={styles.detalhe}>
                {item.ultimaCompra ? `Última compra: ${formatDateBR(item.ultimaCompra)}` : 'Sem histórico de compra'}
              </Text>
              {item.diasSemComprar != null && (
                <Text style={styles.detalhe}>{item.diasSemComprar} dia(s) sem comprar</Text>
              )}
              <View style={[styles.badge, item.inativo ? styles.badgeInativo : styles.badgeAtivo]}>
                <Text style={[styles.badgeText, item.inativo ? styles.badgeTextInativo : styles.badgeTextAtivo]}>
                  {item.inativo ? 'Inativo' : 'Ativo'}
                </Text>
              </View>
            </View>
            {item.telefone && (
              <WhatsAppButton compact telefone={item.telefone} mensagem={mensagemReativacao(item)} />
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  info: { flexShrink: 1, flex: 1 },
  nome: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  detalhe: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, marginTop: 6 },
  badgeAtivo: { backgroundColor: '#dcfce7' },
  badgeInativo: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextAtivo: { color: colors.success },
  badgeTextInativo: { color: colors.red },
  vendedorTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.navy,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  vendedorTagTexto: { color: colors.white, fontSize: 11, fontWeight: '700' },
});
