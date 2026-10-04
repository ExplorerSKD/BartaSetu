import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner, Button, IconButton, Screen } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';
import { permissions } from '../services/permissions';
import { session } from '../services/session';
import { RootStackParamList } from '../navigation/types';

type IconName = keyof typeof Ionicons.glyphMap;
type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding' | 'HowItWorks'>;

interface Slide {
  key: string;
  title: string;
  body: string;
  flow: Array<{ icon: IconName; label: string; color: string }>;
}

const SLIDES: Slide[] = [
  {
    key: 'id',
    title: 'Your own BartaSetu ID',
    body: 'Every account gets a short ID like BS-7K3Q9X. Share yours, or search someone else\'s ID to start a chat.',
    flow: [
      { icon: 'person-circle-outline', label: 'You', color: colors.primary },
      { icon: 'search', label: 'Find by ID', color: colors.text },
      { icon: 'chatbubbles-outline', label: 'Chat', color: colors.primary },
    ],
  },
  {
    key: 'online',
    title: 'Online: instant delivery',
    body: 'When you have internet, messages go through the BartaSetu server and arrive instantly, like any chat app.',
    flow: [
      { icon: 'phone-portrait-outline', label: 'You', color: colors.text },
      { icon: 'cloud-outline', label: 'Server', color: colors.internet },
      { icon: 'phone-portrait-outline', label: 'Friend', color: colors.text },
    ],
  },
  {
    key: 'offline',
    title: 'No internet? Nearby phones help',
    body:
      'Your message hops phone-to-phone over Bluetooth and Wi-Fi through people using BartaSetu, until it reaches your friend, or a phone with internet that uploads it for you.',
    flow: [
      { icon: 'phone-portrait-outline', label: 'You', color: colors.text },
      { icon: 'bluetooth', label: 'Nearby phone', color: colors.nearby },
      { icon: 'wifi', label: 'Has internet', color: colors.internet },
      { icon: 'phone-portrait-outline', label: 'Friend', color: colors.text },
    ],
  },
  {
    key: 'private',
    title: 'Private by design',
    body:
      'Messages are end-to-end encrypted on your phone. Phones that carry them and the server cannot read them. Your phone also helps carry other people\'s messages.',
    flow: [
      { icon: 'lock-closed-outline', label: 'Encrypted', color: colors.primary },
      { icon: 'eye-off-outline', label: 'Relays can\'t read', color: colors.mesh },
      { icon: 'key-outline', label: 'Only your friend', color: colors.primary },
    ],
  },
];

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ navigation, route }: Props) {
  const isHelp = route.name === 'HowItWorks';
  const [index, setIndex] = useState(0);
  const [askingPermission, setAskingPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const listRef = useRef<FlatList<Slide>>(null);

  const finishIntro = async () => {
    await session.setOnboarded();
    navigation.replace('Login');
  };

  const allowNearby = async () => {
    setAskingPermission(true);
    const granted = session.currentUser() ? await session.enableNearby() : await permissions.requestNearby();
    setAskingPermission(false);
    if (granted) {
      if (isHelp) navigation.goBack();
      else await finishIntro();
    } else {
      setPermissionDenied(true);
    }
  };

  const isLast = index === SLIDES.length - 1;

  const next = () => {
    if (!isLast) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {isHelp ? (
          <IconButton icon="close" label="Close" onPress={() => navigation.goBack()} />
        ) : (
          <View />
        )}
        {!isHelp && !isLast ? (
          <Pressable onPress={finishIntro} hitSlop={10}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.flow}>
              {item.flow.map((step, i) => (
                <React.Fragment key={step.label}>
                  {i > 0 ? <Ionicons name="chevron-forward" size={12} color={colors.textMuted} style={{ marginTop: 18 }} /> : null}
                  <View style={styles.flowStep}>
                    <View style={[styles.flowIcon, { borderColor: step.color }]}>
                      <Ionicons name={step.icon} size={22} color={step.color} />
                    </View>
                    <Text style={styles.flowLabel} numberOfLines={2}>{step.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Text style={[type.title, { textAlign: 'center', marginTop: spacing.xxl }]}>{item.title}</Text>
            <Text style={[type.body, styles.body]}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {isLast ? (
          <>
            {permissionDenied ? (
              <Banner tone="warning" icon="information-circle-outline" style={{ marginBottom: spacing.md }}>
                Without nearby access BartaSetu works only with internet. You can turn it on later from the Nearby tab.
              </Banner>
            ) : null}
            <Button
              title="Allow nearby access"
              icon="bluetooth"
              onPress={allowNearby}
              loading={askingPermission}
            />
            <Button
              title={isHelp ? 'Close' : permissionDenied ? 'Continue without it' : 'Not now'}
              variant="ghost"
              onPress={isHelp ? () => navigation.goBack() : finishIntro}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : (
          <Button title="Next" onPress={next} icon="arrow-forward" />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  slide: { paddingHorizontal: spacing.xl, justifyContent: 'center' },
  flow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  flowStep: { alignItems: 'center', width: 58 },
  flowIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowLabel: { marginTop: 6, fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  body: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});
