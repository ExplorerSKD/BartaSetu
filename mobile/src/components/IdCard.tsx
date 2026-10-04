import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, spacing, type } from '../theme';

/** The user's shareable BartaSetu ID with copy and share actions. */
export function IdCard({ bsId, name, hint }: { bsId: string; name: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(bsId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = () =>
    Share.share({
      message: `Message me on BartaSetu, even without internet. My BartaSetu ID is ${bsId}`,
    });

  return (
    <View style={styles.card}>
      <Text style={[type.label, { color: colors.primaryDark }]}>Your BartaSetu ID</Text>
      <Text style={styles.id} selectable>{bsId}</Text>
      <Text style={[type.caption, { textAlign: 'center' }]}>{hint ?? `Share it so people can find ${name} and message you.`}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={copy}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.primary} />
          <Text style={styles.actionText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.action} onPress={share}>
          <Ionicons name="share-social-outline" size={18} color={colors.primary} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  id: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: colors.primaryBorder,
    marginTop: spacing.lg,
  },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6 },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  divider: { width: 1, backgroundColor: colors.primaryBorder },
});
