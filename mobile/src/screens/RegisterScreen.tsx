import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, Button, IconButton, Screen, TextField } from '../components/ui';
import { colors, spacing, type } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen({ navigation }: Props) {
  const { register, busy, error, clearError } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const errors = {
    displayName: displayName.trim().length < 2 ? 'Enter your name' : null,
    username: !USERNAME_RE.test(username.trim().toLowerCase())
      ? '3-30 characters: letters, numbers, dots or underscores'
      : null,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : null,
    password: password.length < 6 ? 'At least 6 characters' : null,
  };
  const valid = !Object.values(errors).some(Boolean);

  const submit = () => {
    setTouched(true);
    if (valid) register({ displayName, username, email, password });
  };

  const show = (e: string | null, value: string) => (touched || value.length > 0 ? e : null);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => navigation.goBack()} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={type.display}>Create your account</Text>
          <Text style={[type.caption, { fontSize: 15, marginTop: 4, marginBottom: spacing.xl }]}>
            You'll get a unique BartaSetu ID that friends use to find you.
          </Text>

          {error ? (
            <Banner tone="danger" icon="alert-circle-outline" style={{ marginBottom: spacing.lg }}>{error}</Banner>
          ) : null}

          <TextField
            label="Your name"
            icon="person-outline"
            value={displayName}
            onChangeText={(t) => {
              setDisplayName(t);
              clearError();
            }}
            placeholder="e.g. Rahim Uddin"
            autoComplete="name"
            error={show(errors.displayName, displayName)}
          />
          <TextField
            label="Username"
            icon="at-outline"
            value={username}
            onChangeText={(t) => {
              setUsername(t.toLowerCase());
              clearError();
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. rahim"
            error={show(errors.username, username)}
          />
          <TextField
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearError();
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            error={show(errors.email, email)}
          />
          <TextField
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError();
            }}
            secure
            autoComplete="password-new"
            placeholder="At least 6 characters"
            error={show(errors.password, password)}
          />

          <Button title="Create account" onPress={submit} loading={busy} style={{ marginTop: spacing.sm }} />
          <Text style={[type.small, styles.note]}>Creating an account needs an internet connection.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  note: { textAlign: 'center', marginTop: spacing.md, color: colors.textMuted },
});
