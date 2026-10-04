import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen } from '../components/ui';
import { IdCard } from '../components/IdCard';
import { colors, spacing, type } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/** Shown once after registration to introduce the new BartaSetu ID. */
export default function WelcomeScreen(_props: Props) {
  const user = useAuthStore((s) => s.user);
  const acknowledgeWelcome = useAuthStore((s) => s.acknowledgeWelcome);
  if (!user) return null;

  // Removing the Welcome screen from the stack shows the main tabs
  const done = () => acknowledgeWelcome();

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={36} color="#fff" />
        </View>
        <Text style={[type.display, { textAlign: 'center' }]}>You're all set, {user.display_name || user.username}!</Text>
        <Text style={[type.body, styles.sub]}>Your account is ready. This is the ID people use to find you:</Text>
        <IdCard bsId={user.bs_id} name={user.display_name || user.username} hint="Share it with friends and family so they can message you." />
      </View>
      <View style={styles.footer}>
        <Button title="Start chatting" icon="chatbubbles-outline" onPress={done} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  sub: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});
