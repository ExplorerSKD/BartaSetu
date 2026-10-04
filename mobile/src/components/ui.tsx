import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, type } from '../theme';
import { initials } from '../lib/format';

type IconName = keyof typeof Ionicons.glyphMap;

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------

export function Screen({
  children,
  edges = ['top'],
  style,
  background = colors.background,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  background?: string;
}) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: background }, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={background} />
      {children}
    </SafeAreaView>
  );
}

export function AppHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={type.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  background = colors.surface,
  size = 22,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  background?: string;
  size?: number;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: background, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: spacing.sm, marginTop: spacing.lg }, style]}>
      <Text style={type.label}>{children}</Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
    secondary: { bg: colors.background, fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.danger, fg: colors.textOnPrimary, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={palette.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  icon,
  error,
  secure,
  style,
  ...props
}: TextInputProps & { label?: string; icon?: IconName; error?: string | null; secure?: boolean }) {
  const [hidden, setHidden] = useState(Boolean(secure));
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[type.caption, styles.fieldLabel]}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && { borderColor: colors.primary, backgroundColor: colors.background },
          error ? { borderColor: colors.danger } : null,
        ]}
      >
        {icon ? <Ionicons name={icon} size={19} color={colors.textMuted} style={{ marginRight: 10 }} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, style]}
          {...props}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Banner({
  tone,
  icon,
  children,
  style,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger';
  icon?: IconName;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    info: { bg: colors.internetSoft, fg: colors.internet },
    success: { bg: colors.primarySoft, fg: colors.primaryDark },
    warning: { bg: colors.nearbySoft, fg: colors.nearby },
    danger: { bg: colors.dangerSoft, fg: colors.dangerDark },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={palette.fg} style={{ marginRight: 10, marginTop: 1 }} /> : null}
      <Text style={[type.caption, { color: palette.fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Identity
// -----------------------------------------------------------------------------

const AVATAR_COLORS = ['#059669', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#0891B2', '#4F46E5', '#65A30D'];

export function Avatar({ name, id, size = 44, badge }: { name: string; id: string; size?: number; badge?: 'online' | 'nearby' | null }) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const bg = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
      </View>
      {badge ? (
        <View
          style={[
            styles.avatarBadge,
            { backgroundColor: badge === 'online' ? colors.primary : colors.nearby, width: size * 0.3, height: size * 0.3, borderRadius: size },
          ]}
        />
      ) : null}
    </View>
  );
}

export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.brand, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Ionicons name="git-network-outline" size={size * 0.55} color="#fff" />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.caption, { textAlign: 'center', marginTop: 6, maxWidth: 290 }]}>{body}</Text>
      {action ? <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Pill({ label, color, background, icon }: { label: string; color: string; background: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} style={{ marginRight: 4 }} /> : null}
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarBadge: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2, borderColor: '#fff' },
  brand: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
