import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppHeader, Avatar, Banner, Button, Card, Pill, Screen } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';
import { formatDistance, timeAgo } from '../lib/format';
import { session } from '../services/session';
import { permissions } from '../services/permissions';
import { transport } from '../services/transport';
import { isReachable, useMeshStore } from '../store/useMeshStore';
import { useChatStore } from '../store/useChatStore';
import { Peer } from '../types';
import { RootStackParamList } from '../navigation/types';

function signal(rssi?: number) {
  if (rssi == null) return null;
  if (rssi > -60) return { bars: 4, label: 'Strong' };
  if (rssi > -72) return { bars: 3, label: 'Good' };
  if (rssi > -84) return { bars: 2, label: 'Fair' };
  return { bars: 1, label: 'Weak' };
}

function Radar() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.radar}>
      <Animated.View
        style={[
          styles.radarRing,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }] },
        ]}
      />
      <View style={styles.radarCore}>
        <Ionicons name="bluetooth" size={26} color="#fff" />
      </View>
    </View>
  );
}

export default function NearbyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const peers = useMeshStore((s) => s.peers);
  const meshSupported = useMeshStore((s) => s.meshSupported);
  const nearbyActive = useMeshStore((s) => s.nearbyActive);
  const bleActive = useMeshStore((s) => s.bleActive);
  const relayedForOthers = useMeshStore((s) => s.relayedForOthers);
  const carrying = useMeshStore((s) => s.carrying);
  const activity = useMeshStore((s) => s.activity);
  const bluetoothOn = useMeshStore((s) => s.bluetoothOn);
  const backgroundAllowed = useMeshStore((s) => s.backgroundAllowed);
  const saveContact = useChatStore((s) => s.saveContact);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    permissions.hasNearby().then(setHasPermission);
  }, [nearbyActive, bleActive]);

  const list = useMemo(
    () =>
      Object.values(peers).sort((a, b) => Number(isReachable(b)) - Number(isReachable(a)) || Number(b.hasInternet) - Number(a.hasInternet)),
    [peers],
  );
  const running = nearbyActive || bleActive;

  const enable = async () => {
    setEnabling(true);
    const granted = await session.enableNearby();
    setHasPermission(granted);
    setEnabling(false);
  };

  const chat = async (peer: Peer) => {
    if (!peer.userId) return;
    await saveContact({ userId: peer.userId, bsId: peer.bsId, displayName: peer.displayName || peer.bsId, publicKey: peer.publicKey ?? null });
    navigation.navigate('Conversation', { peerId: peer.userId });
  };

  const renderPeer = ({ item }: { item: Peer }) => {
    const reachable = isReachable(item);
    const sig = signal(item.rssi);
    const distance = formatDistance(item.distanceMeters);
    const link = item.nearbyConnected ? 'Connected (Bluetooth / Wi-Fi)' : item.bleSeenAt ? 'Bluetooth LE' : 'Connecting…';
    return (
      <Card style={styles.peerCard}>
        <View style={styles.peerTop}>
          <Avatar name={item.displayName || item.bsId} id={item.userId || item.nodeId} size={46} badge={reachable ? 'nearby' : null} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong} numberOfLines={1}>{item.displayName || 'BartaSetu user'}</Text>
            <Text style={type.small}>{item.bsId} · {reachable ? link : `seen ${timeAgo(item.lastSeen)}`}</Text>
          </View>
          {sig ? (
            <View style={styles.bars} accessibilityLabel={`Signal ${sig.label}`}>
              {[1, 2, 3, 4].map((b) => (
                <View key={b} style={[styles.bar, { height: 4 + b * 4 }, b <= sig.bars && { backgroundColor: colors.primary }]} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.tags}>
          {item.hasInternet ? (
            <Pill label="Has internet · can upload messages" icon="globe-outline" color={colors.internet} background={colors.internetSoft} />
          ) : (
            <Pill label="Offline relay" icon="swap-horizontal" color={colors.mesh} background={colors.meshSoft} />
          )}
          {distance ? <Pill label={distance} icon="location-outline" color={colors.textSecondary} background={colors.surface} /> : null}
          <Pill label={`${item.battery}% battery`} icon="battery-half-outline" color={colors.textSecondary} background={colors.surface} />
          {item.relayedCount > 0 ? (
            <Pill label={`${item.relayedCount} passed`} icon="checkmark-done" color={colors.primaryDark} background={colors.primarySoft} />
          ) : null}
        </View>
        {item.userId ? (
          <Button title={`Message ${item.displayName?.split(' ')[0] || 'them'}`} icon="chatbubble-outline" variant="secondary" onPress={() => chat(item)} style={{ marginTop: spacing.md, minHeight: 42 }} />
        ) : null}
      </Card>
    );
  };

  const header = (
    <View>
      {!meshSupported ? (
        <Banner tone="warning" icon="alert-circle-outline" style={styles.block}>
          This build does not include the BartaSetu mesh module, so nearby phones can't be found. Install the full Android app build.
        </Banner>
      ) : hasPermission === false ? (
        <Card style={styles.block}>
          <Text style={type.heading}>Turn on Nearby</Text>
          <Text style={[type.caption, { marginTop: 4, marginBottom: spacing.md }]}>
            BartaSetu needs Bluetooth, Wi-Fi and location permission to find phones around you and pass messages without internet.
          </Text>
          <Button title="Allow nearby access" icon="bluetooth" onPress={enable} loading={enabling} />
        </Card>
      ) : (
        <View style={[styles.block, styles.statusCard]}>
          <Radar />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{running ? 'Looking for BartaSetu phones' : 'Starting nearby radio…'}</Text>
            <Text style={type.caption}>
              {[nearbyActive && 'Bluetooth + Wi-Fi', bleActive && 'Bluetooth LE'].filter(Boolean).join(' · ') || 'Waiting for Bluetooth'}
            </Text>
            <Text style={[type.small, { marginTop: 4 }]}>
              Relayed {relayedForOthers} message{relayedForOthers === 1 ? '' : 's'} for others · carrying {carrying} now
            </Text>
          </View>
        </View>
      )}
      {meshSupported && hasPermission !== false && !bluetoothOn ? (
        <Banner tone="danger" icon="bluetooth" style={[styles.block, { marginTop: spacing.md }]}>
          Bluetooth is off. Turn it on (airplane mode can stay on) so nearby phones can find you.
        </Banner>
      ) : null}
      {meshSupported && hasPermission !== false && !backgroundAllowed ? (
        <Card style={[styles.block, { marginTop: spacing.md }]}>
          <Text style={type.bodyStrong}>Keep BartaSetu running in the background</Text>
          <Text style={[type.caption, { marginTop: 4, marginBottom: spacing.md }]}>
            Your phone may stop BartaSetu to save battery, which makes you invisible to nearby phones. Allow it to run so messages and SOS alerts can reach you.
          </Text>
          <Button title="Allow background running" icon="battery-charging-outline" variant="secondary" onPress={() => transport.requestBackgroundRun()} />
        </Card>
      ) : null}
      {activity.length > 0 ? (
        <Card style={[styles.block, { marginTop: spacing.md, paddingVertical: spacing.md }]}>
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Live activity</Text>
          {activity.slice(0, 6).map((a) => (
            <View key={`${a.at}-${a.text}`} style={styles.activityRow}>
              <Text style={styles.activityTime}>{timeAgo(a.at)}</Text>
              <Text style={[type.caption, { flex: 1, color: colors.text }]}>{a.text}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {list.length > 0 ? <Text style={[type.label, styles.block, { marginTop: spacing.lg }]}>{list.length} phone{list.length === 1 ? '' : 's'} found</Text> : null}
    </View>
  );

  return (
    <Screen>
      <AppHeader title="Nearby" subtitle="BartaSetu phones around you" />
      <FlatList
        data={list}
        keyExtractor={(p) => p.nodeId}
        renderItem={renderPeer}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        ListEmptyComponent={
          meshSupported && hasPermission !== false ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color={colors.textMuted} />
              <Text style={[type.bodyStrong, { marginTop: spacing.sm }]}>No one nearby yet</Text>
              <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>
                Phones appear here when someone with BartaSetu open is within about 30-100 m. Keep Bluetooth on; your messages wait safely until a route appears.
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.nearbySoft,
  },
  radar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  radarRing: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: colors.nearby },
  radarCore: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.nearby, alignItems: 'center', justifyContent: 'center' },
  peerCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  peerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 1, backgroundColor: colors.border },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  empty: { alignItems: 'center', padding: spacing.xxl },
  activityRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 3 },
  activityTime: { width: 64, fontSize: 12, color: colors.textMuted },
});
