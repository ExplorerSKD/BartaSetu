import React, { useEffect, useState } from 'react';
import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import ChatsScreen from '../screens/ChatsScreen';
import FindUserScreen from '../screens/FindUserScreen';
import ConversationScreen from '../screens/ConversationScreen';
import NearbyScreen from '../screens/NearbyScreen';
import SOSScreen from '../screens/SOSScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme';
import { session } from '../services/session';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { reachablePeers, useMeshStore } from '../store/useMeshStore';
import { MainTabParamList, RootStackParamList } from './types';
import { AlertCenter } from '../components/AlertCenter';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.primary, card: colors.background, border: colors.border },
};

type IconName = keyof typeof Ionicons.glyphMap;
const TAB_ICONS: Record<keyof MainTabParamList, [IconName, IconName]> = {
  Chats: ['chatbubbles', 'chatbubbles-outline'],
  Nearby: ['radio', 'radio-outline'],
  SOS: ['warning', 'warning-outline'],
  Profile: ['person-circle', 'person-circle-outline'],
};

function MainTabs() {
  const unread = useChatStore((s) => s.conversations.reduce((n, c) => n + c.unread, 0));
  const nearbyCount = useMeshStore((s) => reachablePeers(s.peers).length);
  const alerts = useMeshStore((s) => s.nearbyAlerts.length);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: route.name === 'SOS' ? colors.danger : colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={route.name === 'SOS' && !focused ? colors.danger : color} />
        ),
      })}
    >
      <Tab.Screen name="Chats" component={ChatsScreen} options={{ tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tab.Screen
        name="Nearby"
        component={NearbyScreen}
        options={{ tabBarBadge: nearbyCount > 0 ? nearbyCount : undefined, tabBarBadgeStyle: { backgroundColor: colors.nearby } }}
      />
      <Tab.Screen name="SOS" component={SOSScreen} options={{ tabBarBadge: alerts > 0 ? '!' : undefined }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const status = useAuthStore((s) => s.status);
  const justRegistered = useAuthStore((s) => s.justRegistered);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void useAuthStore.getState().restore();
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') session.hasOnboarded().then(setOnboarded);
    else setOnboarded(true);
  }, [status]);

  if (status === 'loading' || onboarded === null) return <SplashScreen />;

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
        {status === 'signedIn' ? (
          <>
            {justRegistered ? <Stack.Screen name="Welcome" component={WelcomeScreen} /> : null}
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Conversation" component={ConversationScreen} />
            <Stack.Screen name="FindUser" component={FindUserScreen} />
            <Stack.Screen name="HowItWorks" component={OnboardingScreen} options={{ animation: 'slide_from_bottom' }} />
          </>
        ) : (
          <>
            {!onboarded ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : null}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
      {status === 'signedIn' ? <AlertCenter navigation={navigationRef} /> : null}
    </NavigationContainer>
  );
}
