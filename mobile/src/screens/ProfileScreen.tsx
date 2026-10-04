import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader, Avatar, Card, Screen, SectionLabel } from '../components/ui';
import { IdCard } from '../components/IdCard';
import { colors, spacing, type } from '../theme';
import { crypto } from '../services/crypto';
import { database } from '../services/db';
import { useAuthStore } from '../store/useAuthStore';
import { useMeshStore } from '../store/useMeshStore';
import { RootStackParamList } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;

function Row({ icon, label, value, onPress, danger }: { icon: IconName; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textSecondary} />
      <Text style={[type.body, { flex: 1 }, danger && { color: colors.danger, fontWeight: '600' }]}>{label}</Text>
      {value ? <Text style={[type.caption, { maxWidth: '55%', textAlign: 'right' }]} numberOfLines={1}>{value}</Text> : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const online = useMeshStore((s) => s.online);
  const serverConnected = useMeshStore((s) => s.serverConnected);
  const nearbyActive = useMeshStore((s) => s.nearbyActive);
  const bleActive = useMeshStore((s) => s.bleActive);
  const relayedForOthers = useMeshStore((s) => s.relayedForOthers);
  const ownQueued = useMeshStore((s) => s.ownQueued);
  const [stats, setStats] = useState({ sent: 0, received: 0 });

  useFocusEffect(
    useCallback(() => {
      if (!database.isOpen()) return;
      Promise.all([database.countMessages('out'), database.countMessages('in')]).then(([sent, received]) =>
        setStats({ sent, received }),
      );
    }, []),
  );

  if (!user) return null;
  const name = user.display_name || user.username;

  const confirmLogout = () =>
    Alert.alert('Sign out?', 'Your chats stay saved on this phone and come back when you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <Screen>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.identity}>
          <Avatar name={name} id={user.id} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={type.title} numberOfLines={1}>{name}</Text>
            <Text style={type.caption}>@{user.username} · {user.email}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <IdCard bsId={user.bs_id} name={name} />
        </View>

        <View style={[styles.block, styles.stats]}>
          {[
            { label: 'Sent', value: stats.sent },
            { label: 'Received', value: stats.received },
            { label: 'Relayed for others', value: relayedForOthers },
          ].map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={[type.small, { textAlign: 'center' }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <SectionLabel style={styles.block}>Connection</SectionLabel>
        <Card style={[styles.block, styles.list]}>
          <Row icon="cloud-outline" label="Server" value={serverConnected ? 'Connected' : online ? 'Connecting…' : 'Offline'} />
          <Row
            icon="bluetooth"
            label="Nearby mesh"
            value={nearbyActive && bleActive ? 'Bluetooth + Wi-Fi, BLE' : nearbyActive ? 'Bluetooth + Wi-Fi' : bleActive ? 'Bluetooth LE' : 'Off'}
          />
          <Row icon="time-outline" label="Messages waiting to send" value={String(ownQueued)} />
        </Card>

        <SectionLabel style={styles.block}>Security</SectionLabel>
        <Card style={[styles.block, styles.list]}>
          <Row icon="lock-closed-outline" label="Encryption" value="X25519 + AES-256-GCM" />
          <Row icon="finger-print-outline" label="Key fingerprint" value={crypto.fingerprint()} />
        </Card>

        <SectionLabel style={styles.block}>Help</SectionLabel>
        <Card style={[styles.block, styles.list]}>
          <Row icon="help-circle-outline" label="How BartaSetu works" onPress={() => navigation.navigate('HowItWorks')} />
          <Row icon="log-out-outline" label="Sign out" onPress={confirmLogout} danger />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
});
