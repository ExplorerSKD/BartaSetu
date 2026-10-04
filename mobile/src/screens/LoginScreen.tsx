import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

const DUMMY_PRESETS = [
  { role: 'Citizen (User A)', name: 'Subrata Roy', user: 'citizen', pass: 'password123', icon: '📱', desc: 'Offline Originator' },
  { role: 'Relay Node (User B)', name: 'Animesh Das', user: 'relay', pass: 'password123', icon: '🔄', desc: 'Multi-hop Relay' },
  { role: 'Internet Gateway (User C)', name: 'Fatima Begum', user: 'gateway', pass: 'password123', icon: '🌐', desc: 'FastAPI Bridge' },
  { role: 'Emergency HQ (User D)', name: 'Command Center', user: 'admin', pass: 'password123', icon: '🚨', desc: 'Disaster Ingestion' }
];

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState('citizen');
  const [password, setPassword] = useState('password123');
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async (customUser?: string, customPass?: string) => {
    const targetUser = customUser || username.trim();
    const targetPass = customPass || password;

    if (!targetUser || !targetPass) {
      return;
    }

    clearError();
    const success = await login({ username: targetUser, password: targetPass });
    if (success) {
      navigation.replace('Main');
    }
  };

  const selectPreset = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    handleLogin(user, pass);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Futuristic Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.badgeRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.meshBadge}>P2P BLE MESH ACTIVE</Text>
          </View>
          <Text style={styles.title}>BartaSetu</Text>
          <Text style={styles.bengaliTitle}>বার্তা সেতু</Text>
          <Text style={styles.tagline}>"বার্তা পৌঁছাবে, Internet না থাকলেও।"</Text>
        </View>

        {/* Quick Demo Logins Section */}
        <View style={styles.presetSection}>
          <Text style={styles.presetSectionTitle}>⚡ ONE-TAP DEMO PROFILES</Text>
          <View style={styles.presetGrid}>
            {DUMMY_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.user}
                style={[styles.presetCard, username === p.user && styles.presetCardActive]}
                onPress={() => selectPreset(p.user, p.pass)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetIcon}>{p.icon}</Text>
                <View style={styles.presetInfo}>
                  <Text style={styles.presetRole}>{p.role}</Text>
                  <Text style={styles.presetName}>{p.name}</Text>
                  <Text style={styles.presetDesc}>{p.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Credential Inputs */}
        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USERNAME / CALLSIGN</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. citizen, relay, gateway"
              placeholderTextColor="#64748B"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#64748B"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View style={styles.offlineHintCard}>
            <Text style={styles.offlineHintIcon}>🛡️</Text>
            <Text style={styles.offlineHintText}>
              Autonomous Offline Mode: Login tokens persist in local SQLite and operate without internet connectivity.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
            onPress={() => handleLogin()}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#0B0F19" />
            ) : (
              <Text style={styles.loginBtnText}>AUTHENTICATE & ENTER MESH →</Text>
            )}
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>New mesh node? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Register Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A13',
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 45,
    paddingBottom: 40,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 7,
  },
  meshBadge: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  bengaliTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 2,
  },
  tagline: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    fontStyle: 'italic',
  },
  presetSection: {
    marginBottom: 20,
  },
  presetSectionTitle: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  presetGrid: {
    gap: 8,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  presetCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  presetIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  presetInfo: {
    flex: 1,
  },
  presetRole: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
  },
  presetName: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  presetDesc: {
    color: '#06B6D4',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  formContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginBottom: 14,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  offlineHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    marginBottom: 16,
  },
  offlineHintIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  offlineHintText: {
    color: '#67E8F9',
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  loginBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#070A13',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  registerPrompt: {
    color: '#94A3B8',
    fontSize: 12,
  },
  registerLink: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
});
