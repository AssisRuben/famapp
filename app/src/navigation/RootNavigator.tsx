import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { RankingScreen } from '../screens/RankingScreen';
import { MetasScreen } from '../screens/MetasScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { ClientesScreen } from '../screens/ClientesScreen';
import { AlertasScreen } from '../screens/AlertasScreen';
import { ReceitasScreen } from '../screens/ReceitasScreen';
import { colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapFocused]}>
      <Text style={[styles.tabIconEmoji, !focused && styles.tabIconEmojiInactive]}>{emoji}</Text>
    </View>
  );
}

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} style={styles.logoutButton}>
      <Text style={styles.logoutText}>Sair</Text>
    </Pressable>
  );
}

function AppTabs() {
  const { profile } = useAuth();
  const ehGestor = profile?.role === 'gestor';

  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        headerStyle: { backgroundColor: colors.navy },
        headerTitleStyle: { color: colors.white },
        headerTintColor: colors.white,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10 },
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
        options={{ title: 'Ranking', tabBarIcon: ({ focused }) => <TabIcon emoji="🏆" focused={focused} /> }}
      />
      <Tab.Screen
        name="Alertas"
        component={AlertasScreen}
        options={{ title: 'Alertas', tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" focused={focused} /> }}
      />
      <Tab.Screen
        name="Receitas"
        component={ReceitasScreen}
        options={{ title: 'Receitas', tabBarIcon: ({ focused }) => <TabIcon emoji="💊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Clientes"
        component={ClientesScreen}
        options={{ title: 'Clientes', tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }}
      />
      <Tab.Screen
        name="Equipe"
        component={ehGestor ? MetasScreen : ChecklistScreen}
        options={{
          title: ehGestor ? 'Metas' : 'Checklist',
          tabBarIcon: ({ focused }) => <TabIcon emoji={ehGestor ? '🎯' : '✅'} focused={focused} />,
        }}
      />
    </Tab.Navigator>
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

  return <NavigationContainer>{profile ? <AppTabs /> : <LoginScreen />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoutButton: { marginRight: 16, paddingHorizontal: 8, paddingVertical: 4 },
  logoutText: { color: colors.red, fontWeight: '700' },
  tabIconWrap: {
    width: 34,
    height: 26,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapFocused: {
    backgroundColor: '#E8EEF6',
  },
  tabIconEmoji: { fontSize: 16 },
  tabIconEmojiInactive: { opacity: 0.5 },
});
