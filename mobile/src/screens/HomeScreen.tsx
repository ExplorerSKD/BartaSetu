import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMeshStore } from '../store/useMeshStore';
import { useMessageStore } from '../store/useMessageStore';
import { useAuthStore } from '../store/useAuthStore';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const { isOnline, isMeshActive, nearbyDevices, stats, setIsOnline, toggleMesh } = useMeshStore();
  const { pendingCount, loadMessages, syncPending } = useMessageStore();

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Top App Bar & Profile */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appTitle}>BartaSetu</Text>
            <Text style={styles.appSubTitle}>বার্তা সেতু • MESH NODE</Text>
          </View>

          {/* Interactive Online/Offline Simulation Toggle */}
          <TouchableOpacity
            style={[styles.statusPill, isOnline ? styles.statusOnline : styles.statusOffline]}
            onPress={() => setIsOnline(!isOnline)}
            activeOpacity={0.8}
          >
            <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={[styles.statusPillText, isOnline ? styles.textOnline : styles.textOffline]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Node Profile Hologram Card */}
        <View style={styles.nodeCard}>
          <View style={styles.nodeHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {user?.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={styles.nodeMeta}>
              <Text style={styles.nodeName}>{user?.display_name || user?.username || 'Field Responder'}</Text>
              <Text style={styles.nodeCallsign}>ID: {user?.id ? user.id.slice(0, 13) + '...' : 'LOCAL_NODE_01'}</Text>
            </View>
            <View style={styles.cryptoBadge}>
              <Text style={styles.cryptoBadgeText}>🔒 E2EE X25519</Text>
            </View>
          </View>

          <View style={styles.nodeDivider} />

          <View style={styles.nodeStatsRow}>
            <View style={styles.nodeStatItem}>
              <Text style={styles.statDimLabel}>MODE</Text>
              <Text style={styles.statBrightVal}>{isOnline ? 'Internet Gateway' : 'Store & Forward'}</Text>
            </View>
            <View style={styles.nodeStatItem}>
              <Text style={styles.statDimLabel}>BATTERY</Text>
              <Text style={styles.statBrightVal}>🔋 85%</Text>
            </View>
            <View style={styles.nodeStatItem}>
              <Text style={styles.statDimLabel}>GPS FIX</Text>
              <Text style={styles.statBrightVal}>22.57° N, 88.36° E</Text>
            </View>
          </View>
        </View>

        {/* Live Network Banner */}
        <View style={[styles.networkBanner, isOnline ? styles.netBannerOnline : styles.netBannerOffline]}>
          <Text style={styles.networkBannerIcon}>{isOnline ? '🌐' : '📡'}</Text>
          <View style={styles.networkBannerTextContainer}>
            <Text style={styles.networkBannerTitle}>
              {isOnline ? 'Connected to FastAPI Gateway' : 'Autonomous BLE Mesh Relay Active'}
            </Text>
            <Text style={styles.networkBannerDesc}>
              {isOnline
                ? 'Direct high-speed delivery to backend & recipients'
                : 'Messages hopping phone-to-phone via Bluetooth Low Energy'}
            </Text>
          </View>
        </View>

        {/* Dashboard Metrics Grid */}
        <View style={styles.metricsGrid}>
          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => navigation.navigate('Nearby')}
            activeOpacity={0.7}
          >
            <View style={styles.metricIconWrap}>
              <Text style={styles.metricIcon}>📶</Text>
            </View>
            <Text style={styles.metricValue}>{nearbyDevices.length || 3}</Text>
            <Text style={styles.metricLabel}>Nearby Peers</Text>
            <Text style={styles.metricSub}>BLE Range &lt; 30m</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => syncPending()}
            activeOpacity={0.7}
          >
            <View style={styles.metricIconWrap}>
              <Text style={styles.metricIcon}>⏳</Text>
            </View>
            <Text style={styles.metricValue}>{pendingCount}</Text>
            <Text style={styles.metricLabel}>Pending Relays</Text>
            <Text style={styles.metricSub}>{isOnline ? 'Tap to sync now' : 'Awaiting peer'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => navigation.navigate('Mesh')}
            activeOpacity={0.7}
          >
            <View style={styles.metricIconWrap}>
              <Text style={styles.metricIcon}>🔄</Text>
            </View>
            <Text style={styles.metricValue}>12</Text>
            <Text style={styles.metricLabel}>Hops Completed</Text>
            <Text style={styles.metricSub}>Store & Forward</Text>
          </TouchableOpacity>
        </View>

        {/* Primary Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.sendActionBtn}
            onPress={() => navigation.navigate('Chat')}
            activeOpacity={0.8}
          >
            <View style={styles.actionBtnIconCircle}>
              <Text style={styles.actionBtnIcon}>✉️</Text>
            </View>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.sendActionTitle}>SEND MESH MESSAGE</Text>
              <Text style={styles.sendActionSubtitle}>Encrypted store-and-forward to nearby phones</Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sosActionBtn}
            onPress={() => navigation.navigate('SOS')}
            activeOpacity={0.8}
          >
            <View style={styles.sosIconCircle}>
              <Text style={styles.sosIcon}>🚨</Text>
            </View>
            <View style={styles.actionBtnTextWrap}>
              <Text style={styles.sosActionTitle}>EMERGENCY SOS ALERT</Text>
              <Text style={styles.sosActionSubtitle}>Critical priority broadcast with GPS coordinates</Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Visual Multi-Hop Pipeline Preview */}
        <View style={styles.topologyPreviewCard}>
          <Text style={styles.topologyTitle}>ACTIVE MULTI-HOP PIPELINE</Text>
          <View style={styles.pipelineRow}>
            <View style={styles.pipeStep}>
              <Text style={styles.pipeIcon}>📱</Text>
              <Text style={styles.pipeLabel}>You</Text>
              <Text style={styles.pipeStatus}>Offline</Text>
            </View>
            <Text style={styles.pipeArrow}>⇢</Text>
            <View style={styles.pipeStep}>
              <Text style={styles.pipeIcon}>🔄</Text>
              <Text style={styles.pipeLabel}>Relay Node</Text>
              <Text style={styles.pipeStatus}>Bluetooth</Text>
            </View>
            <Text style={styles.pipeArrow}>⇢</Text>
            <View style={styles.pipeStep}>
              <Text style={styles.pipeIcon}>🌐</Text>
              <Text style={styles.pipeLabel}>Gateway</Text>
              <Text style={styles.pipeStatus}>Internet</Text>
            </View>
            <Text style={styles.pipeArrow}>⇢</Text>
            <View style={styles.pipeStep}>
              <Text style={styles.pipeIcon}>☁️</Text>
              <Text style={styles.pipeLabel}>Server</Text>
              <Text style={styles.pipeStatus}>FastAPI</Text>
            </View>
          </View>
        </View>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  appSubTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  statusOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  textOnline: {
    color: '#34D399',
  },
  textOffline: {
    color: '#F87171',
  },
  nodeCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#10B981',
    marginRight: 12,
  },
  avatarText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '800',
  },
  nodeMeta: {
    flex: 1,
  },
  nodeName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  nodeCallsign: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  cryptoBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  cryptoBadgeText: {
    color: '#22D3EE',
    fontSize: 10,
    fontWeight: '700',
  },
  nodeDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 14,
  },
  nodeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nodeStatItem: {
    flex: 1,
  },
  statDimLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statBrightVal: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  netBannerOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  netBannerOffline: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  networkBannerIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  networkBannerTextContainer: {
    flex: 1,
  },
  networkBannerTitle: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
  },
  networkBannerDesc: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  metricIconWrap: {
    marginBottom: 8,
  },
  metricIcon: {
    fontSize: 18,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  metricSub: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  sendActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionBtnIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionBtnIcon: {
    fontSize: 20,
  },
  actionBtnTextWrap: {
    flex: 1,
  },
  sendActionTitle: {
    color: '#070A13',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sendActionSubtitle: {
    color: 'rgba(7, 10, 19, 0.8)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  actionArrow: {
    fontSize: 20,
    color: '#070A13',
    fontWeight: '800',
  },
  sosActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  sosIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sosIcon: {
    fontSize: 20,
  },
  sosActionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sosActionSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  topologyPreviewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  topologyTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pipeStep: {
    alignItems: 'center',
  },
  pipeIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  pipeLabel: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  pipeStatus: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  pipeArrow: {
    color: '#475569',
    fontSize: 18,
    fontWeight: '800',
  },
});
