import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function SplashScreen() {
  const navigation = useNavigation<any>();
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      const restored = await restoreSession();
      if (!isMounted) return;

      if (restored) {
        navigation.replace('Main');
      } else {
        setTimeout(() => {
          if (isMounted) navigation.replace('Login');
        }, 1200);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [navigation, restoreSession]);

  return (
    <View style={styles.container}>
      <View style={styles.logoOuterRing}>
        <View style={styles.logoMiddleRing}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>📡</Text>
          </View>
        </View>
      </View>

      <Text style={styles.titleEn}>BartaSetu</Text>
      <Text style={styles.titleBn}>বার্তা সেতু</Text>
      <Text style={styles.tagline}>"বার্তা পৌঁছাবে, Internet না থাকলেও।"</Text>

      <View style={styles.badgeRow}>
        <View style={styles.pulseDot} />
        <Text style={styles.badgeText}>OFFLINE-FIRST BLE MESH PROTOCOL</Text>
      </View>

      <ActivityIndicator size="small" color="#10B981" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A13',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoOuterRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoMiddleRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 36,
  },
  titleEn: {
    fontSize: 38,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  titleBn: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  badgeText: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  loader: {
    marginTop: 36,
  },
});
