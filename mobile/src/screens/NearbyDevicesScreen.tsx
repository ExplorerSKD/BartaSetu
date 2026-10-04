import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMeshStore } from '../store/useMeshStore';
import { MeshDevice } from '../types';

export default function NearbyDevicesScreen() {
  const {
    nearbyDevices,
    isMeshActive,
    toggleMesh,
    addDiscoveredDevice,
    loadSavedDevices
  } = useMeshStore();

  useEffect(() => {
    loadSavedDevices();

    if (nearbyDevices.length === 0) {
      addDiscoveredDevice({
        id: 'dev_peer_fatima',
        name: 'Fatima Begum (Gateway)',
        rssi: -42,
        distanceMeters: 8,
        hasInternet: true,
        batteryLevel: 94,
        lastSeen: Date.now()
      });
      addDiscoveredDevice({
        id: 'dev_peer_animesh',
        name: 'Animesh Das (Relay)',
        rssi: -62,
        distanceMeters: 24,
        hasInternet: false,
        batteryLevel: 78,
        lastSeen: Date.now()
      });
      addDiscoveredDevice({
        id: 'dev_peer_subrata',
        name: 'Subrata Roy (Citizen)',
        rssi: -78,
        distanceMeters: 55,
        hasInternet: false,
        batteryLevel: 52,
        lastSeen: Date.now()
      });
    }
  }, [loadSavedDevices, addDiscoveredDevice, nearbyDevices.length]);

  const handleSimulateScan = () => {
    const randomDistance = Math.floor(Math.random() * 60) + 4;
    const randomRssi = -Math.floor(Math.random() * 45 + 38);
    const hasInternet = Math.random() > 0.6;
    const nodeNum = Math.floor(Math.random() * 800 + 100);

    addDiscoveredDevice({
      id: `dev_mesh_${Date.now().toString(36)}`,
      name: `BartaSetu Peer #${nodeNum}`,
      rssi: randomRssi,
      distanceMeters: randomDistance,
      hasInternet,
      batteryLevel: Math.floor(Math.random() * 50 + 50),
      lastSeen: Date.now()
    });
  };

  const getSignalBadge = (rssi: number) => {
    if (rssi > -50) return { label: 'EXCELLENT', color: '#10B981', bars: '●●●●' };
    if (rssi > -68) return { label: 'STRONG', color: '#06B6D4', bars: '●●●○' };
    if (rssi > -80) return { label: 'MODERATE', color: '#F59E0B', bars: '●●○○' };
    return { label: 'WEAK', color: '#EF4444', bars: '●○○○' };
  };

  const renderDeviceCard = ({ item }: { item: MeshDevice }) => {
    const signal = getSignalBadge(item.rssi);
    const relayScore = Math.min(100, Math.max(10, Math.round(
      (item.hasInternet ? 50 : 0) +
      Math.max(0, (item.rssi + 100) * 0.25) +
      (item.batteryLevel ? item.batteryLevel * 0.15 : 10)
    )));

    return (
      <View style={styles.deviceCard}>
        <View style={styles.deviceCardTop}>
          <View style={styles.deviceAvatar}>
            <Text style={styles.deviceAvatarIcon}>{item.hasInternet ? '🌐' : '📱'}</Text>
          </View>

          <View style={styles.deviceMeta}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceId}>ID: {item.id}</Text>
          </View>

          <View style={[styles.signalPill, { borderColor: signal.color }]}>
            <Text style={[styles.signalBars, { color: signal.color }]}>{signal.bars}</Text>
            <Text style={[styles.signalDbm, { color: signal.color }]}>{item.rssi} dBm</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.tagsRow}>
          {item.hasInternet ? (
            <View style={styles.gatewayBadge}>
              <Text style={styles.gatewayBadgeText}>⚡ INTERNET GATEWAY</Text>
            </View>
          ) : (
            <View style={styles.relayBadge}>
              <Text style={styles.relayBadgeText}>🔄 OFFLINE RELAY</Text>
            </View>
          )}

          <View style={styles.distanceBadge}>
            <Text style={styles.distanceText}>📍 ~{item.distanceMeters || 15}m away</Text>
          </View>

          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>★ Score: {relayScore}/100</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nearby BLE Peers</Text>
          <Text style={styles.subtitle}>
            Autonomous discovery via Bluetooth Low Energy (Service UUID: 0000BARTA)
          </Text>
        </View>

        <TouchableOpacity
          style={styles.scanActionBtn}
          onPress={handleSimulateScan}
          activeOpacity={0.8}
        >
          <Text style={styles.scanActionBtnText}>+ SCAN PEER</Text>
        </TouchableOpacity>
      </View>

      {/* Radar Status Bar */}
      <View style={styles.radarBanner}>
        <View style={styles.radarPulseDot} />
        <Text style={styles.radarText}>
          RADAR ACTIVE • DISCOVERED {nearbyDevices.length} SMARTPHONES IN RANGE
        </Text>
      </View>

      <FlatList
        data={nearbyDevices}
        keyExtractor={(item) => item.id}
        renderItem={renderDeviceCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A13',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    maxWidth: 240,
    lineHeight: 15,
  },
  scanActionBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  scanActionBtnText: {
    color: '#070A13',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  radarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  radarPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06B6D4',
    marginRight: 8,
  },
  radarText: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  deviceCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  deviceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceAvatarIcon: {
    fontSize: 20,
  },
  deviceMeta: {
    flex: 1,
  },
  deviceName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  deviceId: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  signalPill: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  signalBars: {
    fontSize: 10,
    letterSpacing: 1,
  },
  signalDbm: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gatewayBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  gatewayBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  relayBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  relayBadgeText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  distanceBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  distanceText: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '700',
  },
  scoreBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
});
