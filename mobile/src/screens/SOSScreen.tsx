import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, Card, Screen, SectionLabel } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';
import { formatClock, formatDistance, haversineMeters, timeAgo } from '../lib/format';
import { device, Coordinates } from '../services/device';
import { mesh } from '../services/mesh';
import { reachablePeers, useMeshStore } from '../store/useMeshStore';

type IconName = keyof typeof Ionicons.glyphMap;

const CATEGORIES: Array<{ key: string; label: string; icon: IconName }> = [
  { key: 'Medical', label: 'Medical', icon: 'medkit-outline' },
  { key: 'Flood', label: 'Flood / Cyclone', icon: 'water-outline' },
  { key: 'Trapped', label: 'Trapped', icon: 'home-outline' },
  { key: 'Fire', label: 'Fire', icon: 'flame-outline' },
  { key: 'Other', label: 'Other', icon: 'alert-circle-outline' },
];

const HOLD_MS = 1500;

export default function SOSScreen() {
  const online = useMeshStore((s) => s.online);
  const peers = useMeshStore((s) => s.peers);
  const lastSos = useMeshStore((s) => s.lastSos);
  const nearbyAlerts = useMeshStore((s) => s.nearbyAlerts);
  const [category, setCategory] = useState('Medical');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState<Coordinates | null>(device.lastKnownLocation());
  const [battery, setBattery] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);

  const nearbyCount = reachablePeers(peers).length;

  useEffect(() => {
    device.batteryPercent().then(setBattery);
    device.approximateLocation().then((loc) => loc && setLocation(loc));
  }, []);

  const startHold = () => {
    if (sending) return;
    Vibration.vibrate(30);
    holdAnim.current = Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    holdAnim.current.start(({ finished }) => {
      if (finished) void fire();
    });
  };

  const cancelHold = () => {
    holdAnim.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const fire = async () => {
    setSending(true);
    Vibration.vibrate([0, 200, 100, 200]);
    try {
      await mesh.sendSos(category, note.trim() || 'I need help');
      setLocation(device.lastKnownLocation());
    } catch (err) {
      Alert.alert('SOS not sent', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
      progress.setValue(0);
    }
  };

  const sosStatus = (() => {
    if (!lastSos) return null;
    switch (lastSos.state) {
      case 'sending':
        return { icon: 'sync' as IconName, text: 'Sending your SOS…', color: colors.textSecondary };
      case 'server':
        return { icon: 'checkmark-circle' as IconName, text: 'Delivered to emergency responders (server)', color: colors.primaryDark };
      case 'mesh':
        return {
          icon: 'bluetooth' as IconName,
          text: `Shared with ${lastSos.sharedWith || 'nearby'} phone${lastSos.sharedWith === 1 ? '' : 's'}. It will reach responders as soon as one has internet.`,
          color: colors.nearby,
        };
      case 'waiting':
        return { icon: 'time-outline' as IconName, text: 'Saved. It will be broadcast the moment a nearby phone or internet is found.', color: colors.nearby };
      default:
        return { icon: 'alert-circle' as IconName, text: 'Could not send. Try again.', color: colors.danger };
    }
  })();

  const ringScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Screen>
      <AppHeader title="Emergency SOS" subtitle="Sends your location to responders and nearby phones" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.routeRow}>
          <View style={[styles.routeChip, online ? styles.chipOn : styles.chipOff]}>
            <Ionicons name={online ? 'globe-outline' : 'cloud-offline-outline'} size={14} color={online ? colors.primaryDark : colors.textSecondary} />
            <Text style={[styles.routeText, { color: online ? colors.primaryDark : colors.textSecondary }]}>{online ? 'Internet' : 'No internet'}</Text>
          </View>
          <View style={[styles.routeChip, nearbyCount > 0 ? styles.chipNearby : styles.chipOff]}>
            <Ionicons name="bluetooth" size={14} color={nearbyCount > 0 ? colors.nearby : colors.textSecondary} />
            <Text style={[styles.routeText, { color: nearbyCount > 0 ? colors.nearby : colors.textSecondary }]}>
              {nearbyCount} nearby
            </Text>
          </View>
        </View>

        <View style={styles.buttonArea}>
          <Animated.View style={[styles.halo, { transform: [{ scale: ringScale }] }]} />
          <Pressable onPressIn={startHold} onPressOut={cancelHold} disabled={sending} accessibilityLabel="Hold to send SOS">
            <View style={styles.sosButton}>
              <Animated.View
                style={[styles.fill, { height: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
              />
              <Text style={styles.sosText}>SOS</Text>
              <Text style={styles.sosHint}>{sending ? 'SENDING…' : 'HOLD TO SEND'}</Text>
            </View>
          </Pressable>
        </View>

        {sosStatus && lastSos ? (
          <Card style={[styles.block, { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }]}>
            <Ionicons name={sosStatus.icon} size={22} color={sosStatus.color} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: sosStatus.color }]}>{sosStatus.text}</Text>
              <Text style={type.small}>
                {lastSos.category} alert at {formatClock(lastSos.createdAt)}{lastSos.hasLocation ? '' : ' · location unavailable'}
              </Text>
            </View>
          </Card>
        ) : null}

        <SectionLabel style={styles.block}>What's happening?</SectionLabel>
        <View style={[styles.block, styles.categories]}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.category, category === c.key && styles.categoryActive]}>
              <Ionicons name={c.icon} size={18} color={category === c.key ? colors.danger : colors.textSecondary} />
              <Text style={[styles.categoryText, category === c.key && { color: colors.dangerDark }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add details (optional), e.g. 3 people, need boat"
          placeholderTextColor={colors.textMuted}
          style={[styles.block, styles.note]}
          maxLength={200}
        />

        <Card style={[styles.block, styles.infoRow]}>
          <View style={styles.infoItem}>
            <Text style={type.label}>Location</Text>
            <Text style={type.bodyStrong}>
              {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Fetched when you send'}
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={[styles.infoItem, { flex: 0.5 }]}>
            <Text style={type.label}>Battery</Text>
            <Text style={type.bodyStrong}>{battery != null ? `${battery}%` : '-'}</Text>
          </View>
        </Card>

        {nearbyAlerts.length > 0 ? (
          <>
            <SectionLabel style={styles.block}>Alerts from people near you</SectionLabel>
            {nearbyAlerts.map((a) => {
              const distance =
                location && a.latitude != null && a.longitude != null
                  ? formatDistance(haversineMeters(location.latitude, location.longitude, a.latitude, a.longitude))
                  : null;
              return (
                <Card key={a.id} style={[styles.block, styles.alertCard]}>
                  <Ionicons name="warning" size={22} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.bodyStrong}>{a.name} · {a.category}</Text>
                    <Text style={type.caption}>{a.message}</Text>
                    <Text style={type.small}>
                      {[distance && `${distance} away`, a.battery != null && `${a.battery}% battery`, `${a.hopCount} hop${a.hopCount === 1 ? '' : 's'}`, timeAgo(a.receivedAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const SIZE = 196;

const styles = StyleSheet.create({
  block: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  routeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  routeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.primarySoft },
  chipNearby: { backgroundColor: colors.nearbySoft },
  chipOff: { backgroundColor: colors.surface },
  routeText: { fontSize: 13, fontWeight: '700' },
  buttonArea: { alignItems: 'center', justifyContent: 'center', height: SIZE + 80 },
  halo: { position: 'absolute', width: SIZE + 44, height: SIZE + 44, borderRadius: (SIZE + 44) / 2, backgroundColor: colors.dangerSoft },
  sosButton: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#FCA5A5',
  },
  fill: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.dangerDark },
  sosText: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  sosHint: { color: '#FEE2E2', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 0 },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  categoryActive: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  categoryText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  note: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoItem: { flex: 1, gap: 4 },
  infoDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },
  alertCard: { flexDirection: 'row', gap: spacing.md, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
});
