import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, type } from '../theme';
import { appEvents } from '../lib/events';
import { formatClock, formatDistance, haversineMeters } from '../lib/format';
import { device } from '../services/device';
import { transport } from '../services/transport';
import { useChatStore } from '../store/useChatStore';
import { useMeshStore } from '../store/useMeshStore';
import { RootStackParamList } from '../navigation/types';

interface Toast {
  peerId: string;
  name: string;
  body: string;
}

/**
 * App-wide alerts while signed in:
 *  - SOS from a nearby phone: full-screen alert with vibration (+ system notification from the mesh)
 *  - New message: in-app banner, or a system notification when the app is in the background
 */
export function AlertCenter({ navigation }: { navigation: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const incomingSos = useMeshStore((s) => s.incomingSos);
  const [toast, setToast] = useState<Toast | null>(null);
  const slide = useRef(new Animated.Value(-120)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (incomingSos) Vibration.vibrate([0, 600, 200, 600, 200, 600]);
  }, [incomingSos]);

  useEffect(
    () =>
      appEvents.on('incomingMessage', ({ peerId, name, body }) => {
        const text = body ?? 'Encrypted message';
        if (AppState.currentState !== 'active') {
          transport.notify('message', name, text);
          return;
        }
        if (useChatStore.getState().activePeerId === peerId) return; // already reading it
        Vibration.vibrate(60);
        setToast({ peerId, name, body: text });
        Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          Animated.timing(slide, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => setToast(null));
        }, 4000);
      }),
    [slide],
  );

  const dismissSos = () => useMeshStore.getState().set({ incomingSos: null });

  const viewSos = () => {
    dismissSos();
    if (navigation.isReady()) navigation.navigate('Main', { screen: 'SOS' } as never);
  };

  const openToast = () => {
    if (!toast) return;
    setToast(null);
    if (navigation.isReady()) navigation.navigate('Conversation', { peerId: toast.peerId });
  };

  const here = device.lastKnownLocation();
  const distance =
    incomingSos && here && incomingSos.latitude != null && incomingSos.longitude != null
      ? formatDistance(haversineMeters(here.latitude, here.longitude, incomingSos.latitude, incomingSos.longitude))
      : null;

  return (
    <>
      {toast ? (
        <Animated.View style={[styles.toastWrap, { transform: [{ translateY: slide }] }]} pointerEvents="box-none">
          <SafeAreaView edges={['top']}>
            <Pressable style={styles.toast} onPress={openToast}>
              <Ionicons name="chatbubble-ellipses" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong} numberOfLines={1}>{toast.name}</Text>
                <Text style={type.caption} numberOfLines={1}>{toast.body}</Text>
              </View>
            </Pressable>
          </SafeAreaView>
        </Animated.View>
      ) : null}

      <Modal visible={incomingSos != null} animationType="fade" transparent onRequestClose={dismissSos}>
        {incomingSos ? (
          <View style={styles.sosBackdrop}>
            <View style={styles.sosCard}>
              <View style={styles.sosIcon}>
                <Ionicons name="warning" size={40} color="#fff" />
              </View>
              <Text style={styles.sosTitle}>SOS nearby</Text>
              <Text style={styles.sosName}>{incomingSos.name} needs help</Text>
              <View style={styles.sosCategory}>
                <Text style={styles.sosCategoryText}>{incomingSos.category}</Text>
              </View>
              <Text style={[type.body, { textAlign: 'center', marginTop: spacing.md }]}>{incomingSos.message}</Text>

              <View style={styles.sosFacts}>
                <Fact icon="location-outline" label={
                  incomingSos.latitude != null && incomingSos.longitude != null
                    ? `${incomingSos.latitude.toFixed(5)}, ${incomingSos.longitude.toFixed(5)}${distance ? ` · ${distance} away` : ''}`
                    : 'Location not available'
                } />
                <Fact icon="battery-half-outline" label={incomingSos.battery != null ? `${incomingSos.battery}% battery` : 'Battery unknown'} />
                <Fact icon="git-network-outline" label={`Reached you through ${incomingSos.hopCount} phone hop${incomingSos.hopCount === 1 ? '' : 's'} at ${formatClock(incomingSos.receivedAt)}`} />
                <Fact icon="share-social-outline" label="Your phone is passing it on to others nearby and to the server when internet is available" />
              </View>

              <Pressable style={styles.sosPrimary} onPress={viewSos}>
                <Text style={styles.sosPrimaryText}>View alerts</Text>
              </Pressable>
              <Pressable style={styles.sosSecondary} onPress={dismissSos}>
                <Text style={styles.sosSecondaryText}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function Fact({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.dangerDark} />
      <Text style={[type.caption, { flex: 1, color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.raised,
  },
  sosBackdrop: { flex: 1, backgroundColor: 'rgba(127, 29, 29, 0.85)', justifyContent: 'center', padding: spacing.lg },
  sosCard: { backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center' },
  sosIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -58,
    borderWidth: 5,
    borderColor: colors.background,
  },
  sosTitle: { fontSize: 28, fontWeight: '900', color: colors.danger, marginTop: spacing.md, letterSpacing: 0.5 },
  sosName: { ...type.heading, marginTop: 2, textAlign: 'center' },
  sosCategory: { marginTop: spacing.sm, backgroundColor: colors.dangerSoft, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  sosCategoryText: { color: colors.dangerDark, fontWeight: '800' },
  sosFacts: { alignSelf: 'stretch', gap: 10, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sosPrimary: { alignSelf: 'stretch', marginTop: spacing.lg, backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  sosPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sosSecondary: { alignSelf: 'stretch', marginTop: spacing.sm, paddingVertical: 12, alignItems: 'center' },
  sosSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
});
