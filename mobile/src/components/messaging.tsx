import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, spacing, type } from '../theme';
import { ChatMessage, MessageStatus, Transport } from '../types';
import { formatClock } from '../lib/format';
import { useMeshStore, reachablePeers } from '../store/useMeshStore';

type IconName = keyof typeof Ionicons.glyphMap;

// -----------------------------------------------------------------------------
// Status ticks: clock = waiting, single tick = on its way, double tick = delivered
// -----------------------------------------------------------------------------

export const STATUS_INFO: Record<MessageStatus, { icon: IconName; label: string; explain: string }> = {
  PENDING: { icon: 'time-outline', label: 'Waiting', explain: 'Saved on your phone. It will be sent when internet or a nearby phone is available.' },
  STORED: { icon: 'time-outline', label: 'Waiting for nearby phones', explain: 'Saved on your phone. It will hop to the next BartaSetu phone that comes in range.' },
  RELAYING: { icon: 'swap-horizontal', label: 'Relaying', explain: 'Being handed to a nearby phone.' },
  RELAYED: { icon: 'checkmark', label: 'Passed to a nearby phone', explain: 'A nearby phone is carrying it towards the recipient or the internet.' },
  GATEWAY_REACHED: { icon: 'checkmark', label: 'Reached an internet phone', explain: 'A phone with internet has it and is uploading it to the server.' },
  SERVER_RECEIVED: { icon: 'checkmark', label: 'Sent', explain: 'The server has it and will deliver it as soon as the recipient is online.' },
  DELIVERED: { icon: 'checkmark-done', label: 'Delivered', explain: 'The recipient\'s phone received and decrypted it.' },
  READ: { icon: 'checkmark-done', label: 'Read', explain: 'The recipient has read it.' },
  FAILED: { icon: 'alert-circle-outline', label: 'Not sent', explain: 'This message could not be delivered.' },
  EXPIRED: { icon: 'hourglass-outline', label: 'Expired', explain: 'No route was found within 24 hours.' },
};

export function StatusTicks({ status, color }: { status: MessageStatus; color: string }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.PENDING;
  const tint = status === 'FAILED' || status === 'EXPIRED' ? '#FECACA' : color;
  return <Ionicons name={info.icon} size={15} color={tint} />;
}

export const TRANSPORT_INFO: Record<Transport, { icon: IconName; label: string; color: string; soft: string }> = {
  internet: { icon: 'globe-outline', label: 'Internet', color: colors.internet, soft: colors.internetSoft },
  direct: { icon: 'bluetooth', label: 'Direct', color: colors.nearby, soft: colors.nearbySoft },
  mesh: { icon: 'git-network-outline', label: 'Mesh', color: colors.mesh, soft: colors.meshSoft },
};

export function transportLabel(m: ChatMessage): string {
  if (m.transport === 'mesh' && m.hopCount > 0) return `Mesh · ${m.hopCount} hop${m.hopCount === 1 ? '' : 's'}`;
  return TRANSPORT_INFO[m.transport].label;
}

// -----------------------------------------------------------------------------
// Connection banner shown at the top of chat screens
// -----------------------------------------------------------------------------

export function ConnectionBanner({ compact }: { compact?: boolean }) {
  const online = useMeshStore((s) => s.online);
  const peers = useMeshStore((s) => s.peers);
  const ownQueued = useMeshStore((s) => s.ownQueued);
  const meshOn = useMeshStore((s) => s.nearbyActive || s.bleActive);
  const nearbyCount = reachablePeers(peers).length;

  let icon: IconName;
  let text: string;
  let fg: string;
  let bg: string;
  if (online) {
    icon = 'cloud-done-outline';
    fg = colors.primaryDark;
    bg = colors.primarySoft;
    text = nearbyCount > 0 ? `Online · ${nearbyCount} phone${nearbyCount === 1 ? '' : 's'} nearby` : 'Online · messages go through the server';
  } else if (nearbyCount > 0) {
    icon = 'bluetooth';
    fg = colors.nearby;
    bg = colors.nearbySoft;
    text = `Offline · ${nearbyCount} BartaSetu phone${nearbyCount === 1 ? '' : 's'} nearby can carry your messages`;
  } else {
    icon = 'cloud-offline-outline';
    fg = colors.textSecondary;
    bg = colors.surface;
    text = meshOn
      ? 'Offline · looking for nearby phones. Messages will wait safely.'
      : 'Offline · turn on Nearby to send without internet';
  }

  return (
    <View style={[styles.banner, { backgroundColor: bg }, compact && { marginHorizontal: 0, borderRadius: 0 }]}>
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={[styles.bannerText, { color: fg }]} numberOfLines={2}>{text}</Text>
      {ownQueued > 0 ? (
        <View style={[styles.queueBadge, { borderColor: fg }]}>
          <Text style={{ color: fg, fontSize: 11, fontWeight: '800' }}>{ownQueued} waiting</Text>
        </View>
      ) : null}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Route sheet: how a single message travelled
// -----------------------------------------------------------------------------

export function RouteSheet({
  message,
  myId,
  peerName,
  onClose,
}: {
  message: ChatMessage | null;
  myId: string;
  peerName: string;
  onClose: () => void;
}) {
  if (!message) return null;
  const status = STATUS_INFO[message.status];
  const outgoing = message.direction === 'out';

  const steps: Array<{ icon: IconName; title: string; detail: string; color: string }> = [];
  steps.push({
    icon: 'create-outline',
    title: outgoing ? 'You wrote it' : `${peerName} wrote it`,
    detail: `Encrypted on ${outgoing ? 'your' : 'their'} phone at ${formatClock(message.createdAt)}`,
    color: colors.text,
  });
  for (const hop of message.route.filter((h) => h.action !== 'ORIGIN')) {
    const isMe = hop.node === myId;
    steps.push({
      icon: hop.action === 'GATEWAY' ? 'globe-outline' : hop.action === 'RECIPIENT' ? 'phone-portrait-outline' : 'swap-horizontal',
      title:
        hop.action === 'RECIPIENT' ? (isMe ? 'Arrived on your phone' : `Arrived on ${peerName}'s phone`)
        : hop.action === 'GATEWAY' ? `${isMe ? 'Your phone' : hop.bsId ?? 'A phone'} uploaded it (internet gateway)`
        : `Carried by ${isMe ? 'your phone' : hop.bsId ?? 'a nearby phone'}`,
      detail: `Hop ${hop.hop} · ${formatClock(hop.at)}`,
      color: hop.action === 'GATEWAY' ? colors.internet : colors.mesh,
    });
  }
  if (message.transport === 'internet') {
    steps.push({ icon: 'cloud-outline', title: 'Through the BartaSetu server', detail: 'Sent over the internet', color: colors.internet });
  }
  steps.push({
    icon: status.icon,
    title: status.label,
    detail: status.explain,
    color: message.status === 'FAILED' || message.status === 'EXPIRED' ? colors.danger : colors.primary,
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={type.heading}>Message journey</Text>
        <Text style={[type.caption, { marginBottom: spacing.lg }]}>
          {TRANSPORT_INFO[message.transport].label} · {message.hopCount} phone-to-phone hop{message.hopCount === 1 ? '' : 's'} · end-to-end encrypted
        </Text>
        <ScrollView style={{ maxHeight: 380 }}>
          {steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, { borderColor: step.color }]}>
                  <Ionicons name={step.icon} size={14} color={step.color} />
                </View>
                {i < steps.length - 1 ? <View style={styles.stepLine} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.lg }}>
                <Text style={type.bodyStrong}>{step.title}</Text>
                <Text style={type.caption}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        {message.body ? (
          <Pressable style={styles.copyRow} onPress={() => Clipboard.setStringAsync(message.body ?? '')}>
            <Ionicons name="copy-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '600', marginLeft: 6 }}>Copy text</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  queueBadge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  overlay: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  step: { flexDirection: 'row' },
  stepRail: { width: 36, alignItems: 'center' },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  copyRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: spacing.sm, padding: spacing.sm },
});
