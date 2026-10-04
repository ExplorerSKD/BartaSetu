import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSOSStore } from '../store/useSOSStore';
import { LocationService } from '../services/LocationService';
import { EmergencyType, LocationCoordinates } from '../types';

const EMERGENCY_PRESETS: { type: EmergencyType; label: string; icon: string }[] = [
  { type: 'Medical', label: 'Medical Trauma', icon: '🚑' },
  { type: 'Flood', label: 'Flood / Cyclone', icon: '🌊' },
  { type: 'Trapped', label: 'Trapped / Structural', icon: '🏚️' },
  { type: 'Fire', label: 'Fire / Hazard', icon: '🔥' },
  { type: 'General Emergency', label: 'General SOS', icon: '🚨' },
];

export default function SOSScreen() {
  const {
    activeAlerts,
    isTriggering,
    selectedEmergencyType,
    setSelectedEmergencyType,
    triggerSOS,
    resolveSOS,
    loadAlerts
  } = useSOSStore();

  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates>({
    latitude: 22.5726,
    longitude: 88.3639,
    accuracy: 5
  });

  useEffect(() => {
    loadAlerts();
    LocationService.getCurrentLocation().then(setCurrentLocation);
  }, [loadAlerts]);

  const handleTriggerSOS = async () => {
    Alert.alert(
      '🚨 BROADCAST EMERGENCY SOS',
      `Transmit immediate distress beacon (${selectedEmergencyType}) to all nearby mesh nodes, gateways, and rescue teams?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'CONFIRM SOS TRANSMIT',
          style: 'destructive',
          onPress: async () => {
            await triggerSOS(
              `CRITICAL DISTRESS: ${selectedEmergencyType}. Requesting evacuation or assistance.`,
              selectedEmergencyType
            );
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Urgent Warning Header */}
        <View style={styles.header}>
          <View style={styles.priorityPill}>
            <View style={styles.flashingDot} />
            <Text style={styles.priorityText}>PRIORITY 1: DISASTER RELAY</Text>
          </View>
          <Text style={styles.headerTitle}>Emergency SOS Beacon</Text>
          <Text style={styles.headerSub}>
            Broadcasts at highest priority across BLE mesh nodes without internet.
          </Text>
        </View>

        {/* Live GPS Telemetry Box */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>GPS COORDINATES</Text>
              <Text style={styles.telemetryVal}>
                {currentLocation.latitude.toFixed(4)}° N, {currentLocation.longitude.toFixed(4)}° E
              </Text>
            </View>
            <View style={styles.telemetryDivider} />
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>BATTERY</Text>
              <Text style={styles.telemetryVal}>🔋 85%</Text>
            </View>
          </View>
        </View>

        {/* Giant Pulsating SOS Button */}
        <View style={styles.sosButtonContainer}>
          {/* Radar ripple rings */}
          <View style={styles.rippleOuter}>
            <View style={styles.rippleMiddle}>
              <TouchableOpacity
                style={[styles.bigSosButton, isTriggering && styles.bigSosButtonDisabled]}
                onPress={handleTriggerSOS}
                disabled={isTriggering}
                activeOpacity={0.8}
              >
                {isTriggering ? (
                  <ActivityIndicator size="large" color="#FFFFFF" />
                ) : (
                  <View style={styles.sosButtonInner}>
                    <Text style={styles.sosSymbol}>SOS</Text>
                    <Text style={styles.sosSubPrompt}>TAP TO BROADCAST</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Emergency Category Selector */}
        <View style={styles.categorySection}>
          <Text style={styles.categorySectionTitle}>SELECT EMERGENCY CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {EMERGENCY_PRESETS.map((p) => {
              const isSelected = selectedEmergencyType === p.type;
              return (
                <TouchableOpacity
                  key={p.type}
                  style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
                  onPress={() => setSelectedEmergencyType(p.type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryIcon}>{p.icon}</Text>
                  <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelSelected]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Active Emergencies Feed */}
        {activeAlerts && activeAlerts.length > 0 && (
          <View style={styles.activeAlertsSection}>
            <Text style={styles.activeAlertsTitle}>
              ACTIVE DISTRESS BEACONS ({activeAlerts.length})
            </Text>
            {activeAlerts.map((alert) => (
              <View key={alert.id} style={styles.activeAlertCard}>
                <View style={styles.activeAlertTop}>
                  <Text style={styles.activeAlertIcon}>🚨</Text>
                  <View style={styles.activeAlertMeta}>
                    <Text style={styles.activeAlertMsg}>{alert.message}</Text>
                    <Text style={styles.activeAlertTime}>
                      {new Date(alert.timestamp).toLocaleTimeString()} • Lat: {alert.location?.latitude.toFixed(3)}, Lon: {alert.location?.longitude.toFixed(3)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={() => resolveSOS(alert.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.resolveBtnText}>MARK RESOLVED ✓</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A13',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    marginBottom: 10,
  },
  flashingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  priorityText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 300,
    lineHeight: 16,
  },
  telemetryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 24,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryItem: {
    flex: 1,
  },
  telemetryDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },
  telemetryLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryVal: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  sosButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  rippleOuter: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleMiddle: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(220, 38, 38, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigSosButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  bigSosButtonDisabled: {
    opacity: 0.6,
  },
  sosButtonInner: {
    alignItems: 'center',
  },
  sosSymbol: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 3,
  },
  sosSubPrompt: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  categorySection: {
    marginTop: 24,
    marginBottom: 20,
  },
  categorySectionTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryCardSelected: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderColor: '#DC2626',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryLabelSelected: {
    color: '#F87171',
    fontWeight: '800',
  },
  activeAlertsSection: {
    marginTop: 10,
  },
  activeAlertsTitle: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  activeAlertCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 10,
  },
  activeAlertTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  activeAlertIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  activeAlertMeta: {
    flex: 1,
  },
  activeAlertMsg: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  activeAlertTime: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  resolveBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  resolveBtnText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
