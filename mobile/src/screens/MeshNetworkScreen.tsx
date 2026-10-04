import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMeshStore } from '../store/useMeshStore';

export default function MeshNetworkScreen() {
  const { stats, nearbyDevices, isOnline } = useMeshStore();
  const gatewayNode = nearbyDevices.find((d) => d.hasInternet) || nearbyDevices[0];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Multi-Hop Mesh Topology</Text>
          <Text style={styles.subtitle}>
            Live visual packet relay route from offline device to cloud backend
          </Text>
        </View>

        {/* Multi-Hop Relay Chain */}
        <View style={styles.chainContainer}>
          {/* Step 1: Originator */}
          <View style={styles.nodeCard}>
            <View style={styles.nodeHeaderRow}>
              <View style={[styles.nodeIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                <Text style={styles.nodeIcon}>📱</Text>
              </View>
              <View style={styles.nodeTextMeta}>
                <Text style={styles.nodeTitle}>Phone A (Sender / Originator)</Text>
                <Text style={styles.nodeSub}>Status: {isOnline ? 'Direct Uplink' : 'Offline • Bluetooth Active'}</Text>
              </View>
              <View style={styles.hopBadge}>
                <Text style={styles.hopBadgeText}>HOP 0</Text>
              </View>
            </View>
            <Text style={styles.nodeDescription}>
              Plaintext encrypted locally with recipient's X25519 public key. Stored in SQLite.
            </Text>
          </View>

          {/* Connection Line 1 */}
          <View style={styles.connectorRow}>
            <View style={styles.connectorLine} />
            <View style={styles.protocolPill}>
              <Text style={styles.protocolText}>BLE GATT • 512-Byte MTU Chunks</Text>
            </View>
            <View style={styles.connectorLine} />
          </View>

          {/* Step 2: Intermediate Relay */}
          <View style={styles.nodeCard}>
            <View style={styles.nodeHeaderRow}>
              <View style={[styles.nodeIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                <Text style={styles.nodeIcon}>🔄</Text>
              </View>
              <View style={styles.nodeTextMeta}>
                <Text style={styles.nodeTitle}>Phone B (Volunteer Relay Node)</Text>
                <Text style={styles.nodeSub}>Store-and-Forward • No Internet</Text>
              </View>
              <View style={styles.hopBadge}>
                <Text style={styles.hopBadgeText}>HOP 1</Text>
              </View>
            </View>
            <Text style={styles.nodeDescription}>
              Stores ciphertext in SQLite without decrypting. Increments hop count. Forwards to best candidate peer.
            </Text>
          </View>

          {/* Connection Line 2 */}
          <View style={styles.connectorRow}>
            <View style={styles.connectorLine} />
            <View style={styles.protocolPill}>
              <Text style={styles.protocolText}>BLE Peer-to-Peer Relay</Text>
            </View>
            <View style={styles.connectorLine} />
          </View>

          {/* Step 3: Gateway Node */}
          <View style={[styles.nodeCard, styles.nodeCardGateway]}>
            <View style={styles.nodeHeaderRow}>
              <View style={[styles.nodeIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Text style={styles.nodeIcon}>🌐</Text>
              </View>
              <View style={styles.nodeTextMeta}>
                <Text style={styles.nodeTitle}>
                  {gatewayNode?.name || 'Phone C (Internet Gateway)'}
                </Text>
                <Text style={styles.nodeSub}>Internet ON • Cellular LTE / Wi-Fi</Text>
              </View>
              <View style={[styles.hopBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Text style={[styles.hopBadgeText, { color: '#34D399' }]}>GATEWAY</Text>
              </View>
            </View>
            <Text style={styles.nodeDescription}>
              Detects active internet connectivity. Immediately uploads relayed packets to FastAPI backend.
            </Text>
          </View>

          {/* Connection Line 3 */}
          <View style={styles.connectorRow}>
            <View style={styles.connectorLine} />
            <View style={styles.protocolPill}>
              <Text style={styles.protocolText}>HTTPS REST • /api/messages/sync</Text>
            </View>
            <View style={styles.connectorLine} />
          </View>

          {/* Step 4: FastAPI Cloud */}
          <View style={styles.nodeCard}>
            <View style={styles.nodeHeaderRow}>
              <View style={[styles.nodeIconWrap, { backgroundColor: 'rgba(6, 182, 212, 0.2)' }]}>
                <Text style={styles.nodeIcon}>☁️</Text>
              </View>
              <View style={styles.nodeTextMeta}>
                <Text style={styles.nodeTitle}>FastAPI Backend + MariaDB</Text>
                <Text style={styles.nodeSub}>Ingestion, Route Audit & Storage</Text>
              </View>
              <View style={styles.hopBadge}>
                <Text style={styles.hopBadgeText}>CLOUD</Text>
              </View>
            </View>
            <Text style={styles.nodeDescription}>
              Stores message record, logs multi-hop route audit trail, and pushes to recipient via WebSocket or FCM.
            </Text>
          </View>

          {/* Connection Line 4 */}
          <View style={styles.connectorRow}>
            <View style={styles.connectorLine} />
            <View style={styles.protocolPill}>
              <Text style={styles.protocolText}>WebSocket Real-Time / FCM Push</Text>
            </View>
            <View style={styles.connectorLine} />
          </View>

          {/* Step 5: Target Recipient */}
          <View style={[styles.nodeCard, styles.nodeCardRecipient]}>
            <View style={styles.nodeHeaderRow}>
              <View style={[styles.nodeIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                <Text style={styles.nodeIcon}>🎯</Text>
              </View>
              <View style={styles.nodeTextMeta}>
                <Text style={styles.nodeTitle}>Phone D (Target Recipient / HQ)</Text>
                <Text style={styles.nodeSub}>E2EE Decrypted with Private Key</Text>
              </View>
              <View style={[styles.hopBadge, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                <Text style={[styles.hopBadgeText, { color: '#C084FC' }]}>DESTINATION</Text>
              </View>
            </View>
            <Text style={styles.nodeDescription}>
              Recipient decrypts payload. Generates cryptographic delivery acknowledgement (ACK) back to network.
            </Text>
          </View>
        </View>

        {/* Network Metrics Footer */}
        <View style={styles.metricsBox}>
          <Text style={styles.metricsBoxTitle}>MESH SPECIFICATIONS</Text>
          <View style={styles.specsGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>MAX HOP LIMIT</Text>
              <Text style={styles.specVal}>10 Hops (Loop Guard)</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>DEDUPLICATION</Text>
              <Text style={styles.specVal}>UUID Check in SQLite</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>ENCRYPTION</Text>
              <Text style={styles.specVal}>X25519 + AES-256-GCM</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>DISCOVERY</Text>
              <Text style={styles.specVal}>UUID: 0000BARTA</Text>
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
  header: {
    marginBottom: 20,
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
    marginTop: 4,
    lineHeight: 16,
  },
  chainContainer: {
    marginBottom: 24,
  },
  nodeCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  nodeCardGateway: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  nodeCardRecipient: {
    borderColor: 'rgba(168, 85, 247, 0.4)',
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  nodeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nodeIcon: {
    fontSize: 18,
  },
  nodeTextMeta: {
    flex: 1,
  },
  nodeTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  nodeSub: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  hopBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hopBadgeText: {
    color: '#CBD5E1',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  nodeDescription: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  connectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  protocolPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 8,
  },
  protocolText: {
    color: '#67E8F9',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metricsBoxTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  specItem: {
    width: '46%',
  },
  specLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  specVal: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
