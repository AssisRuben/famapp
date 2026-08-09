import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ClientesVendedorScreen } from '../screens/ClientesVendedorScreen';
import { MetasScreen } from '../screens/MetasScreen';
import { MetaScreen } from '../screens/MetaScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { ChecklistGerenciarScreen } from '../screens/ChecklistGerenciarScreen';
import { ClientesScreen } from '../screens/ClientesScreen';
import { AlertasScreen } from '../screens/AlertasScreen';
import { ReceitasScreen } from '../screens/ReceitasScreen';
import { CampanhasScreen } from '../screens/CampanhasScreen';
import { CartazetesScreen } from '../screens/CartazetesScreen';
import { ComprasScreen } from '../screens/ComprasScreen';
import { VendaAdicionalScreen } from '../screens/VendaAdicionalScreen';
import { ProdutoEmFaltaScreen } from '../screens/ProdutoEmFaltaScreen';
import { PrecificacaoScreen } from '../screens/PrecificacaoScreen';
import { PendenciasScreen } from '../screens/PendenciasScreen';
import { CarteiraClientesScreen } from '../screens/CarteiraClientesScreen';
import { SideDrawer } from '../components/SideDrawer';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapFocused]}>
      <Text style={[styles.tabIconEmoji, !focused && styles.tabIconEmojiInactive]}>{emoji}</Text>
    </View>
  );
}

// Ícone de menu virou aba própria na barra debaixo (05/08/2026) — antes
// ficava fixo no header, ocupando uma "tarja" de cima só pra isso. Mesmo
// wrap visual do TabIcon, só troca o emoji por ícone de verdade.
function TabIconMenu({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapFocused]}>
      <Ionicons name="menu" size={22} color={focused ? colors.navy : colors.textMuted} />
    </View>
  );
}

// Tab "Menu" não navega pra lugar nenhum — abre o drawer e cancela a
// navegação (tabPress abaixo), então o component nunca é de fato
// renderizado. React Navigation exige um component mesmo assim.
function MenuPlaceholder() {
  return null;
}

// tabBarButton: () => null só esconde o CONTEÚDO — o item continua
// reservando flex:1 na barra (é assim que a lib desenha cada aba), o
// que deixava buracos e as abas visíveis desalinhadas. Zerar o
// tabBarItemStyle junto colapsa o espaço de verdade.
// [06/08/2026] Sem seta de voltar no header nem header nenhum pra essas
// abas — a barra debaixo (com a aba "Menu" e as outras principais)
// continua visível e funcional por baixo dos panos mesmo aqui, então já
// é o "jeito de sair" sem precisar de outro botão redundante.
function abaOculta(oculta: boolean) {
  return oculta
    ? {
        tabBarButton: () => null,
        tabBarItemStyle: { flex: 0, width: 0, padding: 0, margin: 0 },
      }
    : {};
}

// Barra principal fica só com as abas fixas de cada papel (Alertas
// virou fixa pros dois em 01/08/2026, reaproveitando a mesma tela do
// gestor — a lista de produto em promoção já não era filtrada por
// vendedor) — o resto mora no drawer lateral, aberto pela aba "Menu"
// na própria barra debaixo (05/08/2026 — antes era um ícone fixo no
// header; virou aba pra tirar a "tarja" de cima e ficar consistente
// com o resto da navegação, que já é toda pela barra debaixo).
function AppTabs() {
  const { profile, signOut } = useAuth();
  const ehGestor = profile?.role === 'gestor';
  const [menuAberto, setMenuAberto] = useState(false);
  const insets = useSafeAreaInsets();

  const irPara = (rota: string) => {
    setMenuAberto(false);
    navigationRef.navigate(rota as never);
  };

  const itensDrawer = [
    { label: ehGestor ? 'Check list' : 'Meta', emoji: ehGestor ? '✅' : '🎯', onPress: () => irPara('Meta') },
    { label: 'Produto em falta', emoji: '📦', onPress: () => irPara('ProdutoEmFalta') },
    { label: 'Pendências', emoji: '🗒️', onPress: () => irPara('Pendencias') },
    { label: 'Carteira de clientes', emoji: '👥', onPress: () => irPara('CarteiraClientes') },
    ...(ehGestor
      ? [
          { label: 'Metas', emoji: '🎯', onPress: () => irPara('Equipe') },
          { label: 'Venda adicional', emoji: '🎁', onPress: () => irPara('VendaAdicional') },
          { label: 'Campanhas', emoji: '📢', onPress: () => irPara('Campanhas') },
          { label: 'Cartazetes', emoji: '🖨️', onPress: () => irPara('Cartazetes') },
          { label: 'Compras', emoji: '🛒', onPress: () => irPara('Compras') },
          { label: 'Precificação', emoji: '📊', onPress: () => irPara('Precificacao') },
        ]
      : [{ label: 'Cliente para resgate', emoji: '👥', onPress: () => irPara('Clientes') }]),
    { label: 'Sair', emoji: '🚪', onPress: () => { setMenuAberto(false); signOut(); }, perigo: true },
  ];

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.navy },
          headerTitleStyle: { color: colors.white },
          headerTintColor: colors.white,
          tabBarActiveTintColor: colors.navy,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 10 },
          tabBarStyle: { height: 58 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 8 },
          tabBarItemStyle: { flex: 1 },
          // sem header em nenhuma tela, o conteúdo começa em y=0 — sem
          // esse respiro, ficaria embaixo da status bar do celular
          // (hora, bateria).
          sceneStyle: { paddingTop: insets.top },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Painel', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
        />
        <Tab.Screen
          name="MeusClientes"
          component={ClientesVendedorScreen}
          options={{
            title: 'Meus Clientes',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📇" focused={focused} />,
            ...abaOculta(ehGestor),
          }}
        />
        <Tab.Screen
          name="Alertas"
          component={AlertasScreen}
          options={{
            title: 'Alertas',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Receitas"
          component={ReceitasScreen}
          options={{ title: 'Receitas', tabBarIcon: ({ focused }) => <TabIcon emoji="💊" focused={focused} /> }}
        />
        <Tab.Screen
          name="Clientes"
          component={ClientesScreen}
          options={{
            title: 'Clientes',
            tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} />,
            ...abaOculta(!ehGestor),
          }}
        />
        <Tab.Screen
          name="Equipe"
          component={ehGestor ? MetasScreen : ChecklistScreen}
          options={{
            title: ehGestor ? 'Metas' : 'Checklist',
            tabBarIcon: ({ focused }) => <TabIcon emoji={ehGestor ? '🎯' : '✅'} focused={focused} />,
            ...abaOculta(ehGestor),
          }}
        />
        <Tab.Screen
          name="Menu"
          component={MenuPlaceholder}
          options={{
            title: 'Menu',
            tabBarIcon: ({ focused }) => <TabIconMenu focused={focused} />,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMenuAberto(true);
            },
          }}
        />
        <Tab.Screen
          name="Meta"
          component={ehGestor ? ChecklistGerenciarScreen : MetaScreen}
          options={{
            title: ehGestor ? 'Check list' : 'Meta',
            tabBarIcon: ({ focused }) => <TabIcon emoji={ehGestor ? '✅' : '🎯'} focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="ProdutoEmFalta"
          component={ProdutoEmFaltaScreen}
          options={{
            title: 'Produto em falta',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="Pendencias"
          component={PendenciasScreen}
          options={{
            title: 'Pendências',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🗒️" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="CarteiraClientes"
          component={CarteiraClientesScreen}
          options={{
            title: 'Carteira de clientes',
            tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="VendaAdicional"
          component={VendaAdicionalScreen}
          options={{
            title: 'Venda adicional',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🎁" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="Campanhas"
          component={CampanhasScreen}
          options={{
            title: 'Campanhas',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📢" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="Cartazetes"
          component={CartazetesScreen}
          options={{
            title: 'Cartazetes',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🖨️" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="Compras"
          component={ComprasScreen}
          options={{
            title: 'Compras',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} />,
            ...abaOculta(true),
          }}
        />
        <Tab.Screen
          name="Precificacao"
          component={PrecificacaoScreen}
          options={{
            title: 'Precificação',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
            ...abaOculta(true),
          }}
        />
      </Tab.Navigator>

      <SideDrawer visible={menuAberto} onClose={() => setMenuAberto(false)} items={itensDrawer} />
    </>
  );
}

export function RootNavigator() {
  const { profile, loadingSession } = useAuth();

  if (loadingSession) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {profile ? <AppTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIconWrap: {
    width: 44,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapFocused: {
    backgroundColor: '#E8EEF6',
  },
  tabIconEmoji: { fontSize: 22, lineHeight: 26 },
  tabIconEmojiInactive: { opacity: 0.5 },
});
