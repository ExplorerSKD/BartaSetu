import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      Alert.alert('Required Fields', 'Please fill in username, email, and password.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    clearError();
    const success = await register({
      username: username.trim(),
      email: email.trim(),
      password,
      display_name: displayName.trim() || username.trim()
    });

    if (success) {
      navigation.replace('Main');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Create Account</Text>
      <Text style={styles.subHeader}>Join BartaSetu Mesh Network</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#64748b"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#64748b"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Display Name"
        placeholderTextColor="#64748b"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#64748b"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        placeholderTextColor="#64748b"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Register</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, justifyContent: 'center' },
  header: { fontSize: 32, color: '#f8fafc', fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  subHeader: { fontSize: 14, color: '#94a3b8', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: '#10b981', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  link: { color: '#3b82f6', textAlign: 'center', marginTop: 10 },
  errorText: { color: '#ef4444', textAlign: 'center', marginBottom: 15, fontSize: 14 },
});
