import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { RankingScreen } from '../screens/RankingScreen';
import { MetasScreen } from '../screens/MetasScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { ClientesScreen } from '../screens/ClientesScreen';
import { AlertasScreen } from '../screens/AlertasScreen';
import { ReceitasScreen } from '../screens/ReceitasScreen';
import { CampanhasScreen } from '../screens/CampanhasScreen';
import { CartazetesScreen } from '../screens/CartazetesScreen';
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

// tabBarButton: () => null só esconde o CONTEÚDO — o item continua
// reservando flex:1 na barra (é assim que a lib desenha cada aba), o
// que deixava buracos e as abas visíveis desalinhadas. Zerar o
// tabBarItemStyle junto colapsa o espaço de verdade.
function abaOculta(oculta: boolean) {
  return oculta
    ? { tabBarButton: () => null, tabBarItemStyle: { flex: 0, width: 0, padding: 0, margin: 0 } }
    : {};
}

// Barra principal fica só com as 4 abas fixas de cada papel — o resto
// mora no drawer lateral, aberto pelo ícone de menu no header (no
// lugar de onde ficava o botão "Sair", que agora é um item do drawer).
function AppTabs() {
  const { profile, signOut } = useAuth();
  const ehGestor = profile?.role === 'gestor';
  const [menuAberto, setMenuAberto] = useState(false);

  const irPara = (rota: string) => {
    setMenuAberto(false);
    navigationRef.navigate(rota as never);
  };

  const itensDrawer = [
    ...(ehGestor
      ? [
          { label: 'Ranking', emoji: '🏆', onPress: () => irPara('Ranking') },
          { label: 'Metas', emoji: '🎯', onPress: () => irPara('Equipe') },
          { label: 'Campanhas', emoji: '📢', onPress: () => irPara('Campanhas') },
          { label: 'Cartazetes', emoji: '🖨️', onPress: () => irPara('Cartazetes') },
        ]
      : [
          { label: 'Clientes', emoji: '👥', onPress: () => irPara('Clientes') },
          { label: 'Alertas', emoji: '🔔', onPress: () => irPara('Alertas') },
        ]),
    { label: 'Sair', emoji: '🚪', onPress: () => { setMenuAberto(false); signOut(); }, perigo: true },
  ];

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          headerRight: () => (
            <Pressable onPress={() => setMenuAberto(true)} style={styles.menuButton} hitSlop={8}>
              <Ionicons name="menu" size={26} color={colors.white} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: colors.navy },
          headerTitleStyle: { color: colors.white },
          headerTintColor: colors.white,
          tabBarActiveTintColor: colors.navy,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 10 },
          tabBarStyle: { height: 68, paddingTop: 6, paddingBottom: 8 },
          tabBarItemStyle: { flex: 1 },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Painel', tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
        />
        <Tab.Screen
          name="Ranking"
          component={RankingScreen}
          options={{
            title: 'Ranking',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} />,
            ...abaOculta(ehGestor),
          }}
        />
        <Tab.Screen
          name="Alertas"
          component={AlertasScreen}
          options={{
            title: 'Alertas',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" focused={focused} />,
            ...abaOculta(!ehGestor),
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
  menuButton: { marginRight: 16, padding: 4 },
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
