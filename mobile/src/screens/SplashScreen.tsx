import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BrandMark, Screen } from '../components/ui';
import { colors, spacing, type } from '../theme';

export default function SplashScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.center}>
        <BrandMark size={84} />
        <Text style={[type.display, { marginTop: spacing.xl }]}>BartaSetu</Text>
        <Text style={[type.caption, styles.tagline]}>Messages that arrive, even without internet.</Text>
      </View>
      <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.xxxl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  tagline: { marginTop: spacing.sm, fontSize: 15, textAlign: 'center' },
});
