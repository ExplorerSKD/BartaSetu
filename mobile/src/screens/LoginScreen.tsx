import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, BrandMark, Button, Screen, TextField } from '../components/ui';
import { colors, spacing, type } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login, busy, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <BrandMark size={64} />
            <Text style={[type.display, { marginTop: spacing.lg }]}>Welcome back</Text>
            <Text style={[type.caption, { fontSize: 15, marginTop: 4 }]}>Sign in to BartaSetu</Text>
          </View>

          {error ? (
            <Banner tone="danger" icon="alert-circle-outline" style={{ marginBottom: spacing.lg }}>{error}</Banner>
          ) : null}

          <TextField
            label="Username or email"
            icon="person-outline"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (error) clearError();
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            placeholder="e.g. rahim"
          />
          <TextField
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) clearError();
            }}
            secure
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => canSubmit && login(username, password)}
            placeholder="Your password"
          />

          <Button
            title="Sign in"
            onPress={() => login(username, password)}
            loading={busy}
            disabled={!canSubmit}
            style={{ marginTop: spacing.sm }}
          />

          <Text style={[type.small, styles.note]}>
            Signing in needs internet once. After that, BartaSetu keeps working offline through nearby phones.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={type.caption}>New to BartaSetu? </Text>
          <Pressable
            onPress={() => {
              clearError();
              navigation.navigate('Register');
            }}
            hitSlop={8}
          >
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxxl, paddingBottom: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  note: { textAlign: 'center', marginTop: spacing.lg, lineHeight: 17 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
