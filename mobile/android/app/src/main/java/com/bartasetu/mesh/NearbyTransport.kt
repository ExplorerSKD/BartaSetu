package com.bartasetu.mesh

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import java.util.concurrent.ConcurrentHashMap

/**
 * Primary phone-to-phone transport built on Google Nearby Connections.
 * Nearby discovers over Bluetooth and upgrades to Wi-Fi automatically, giving a fast two-way link.
 * P2P_CLUSTER lets every phone be connected to several others at once, which is what a mesh needs.
 */
class NearbyTransport(private val context: Context) {
    private val tag = "BartaSetu.Nearby"
    private val client: ConnectionsClient = Nearby.getConnectionsClient(context)
    private val handler = Handler(Looper.getMainLooper())

    private var localInfo: PeerInfo? = null
    private var running = false
    @Volatile private var advertising = false
    @Volatile private var discovering = false
    @Volatile private var startedAt = 0L

    /** Discovered endpoints (not necessarily connected yet) and connected ones. */
    private val discovered = ConcurrentHashMap<String, PeerInfo>()
    private val connected = ConcurrentHashMap<String, PeerInfo>()
    private val pending = ConcurrentHashMap.newKeySet<String>()
    private val retries = ConcurrentHashMap<String, Int>()

    companion object {
        const val TRANSPORT = "nearby"
        private const val SERVICE_ID = "com.bartasetu.mesh"
        private const val MAX_CONNECTIONS = 6
        private const val MAX_RETRIES = 5
        private val STRATEGY = Strategy.P2P_CLUSTER

        fun isAvailable(context: Context): Boolean =
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    fun start(info: PeerInfo) {
        localInfo = info
        if (running) return
        running = true
        startedAt = System.currentTimeMillis()
        startAdvertising()
        startDiscovery()
    }

    /**
     * True while both advertising (being visible) and discovery (looking for others) are active.
     * Both confirm asynchronously, so a transport that just started gets a 15 s grace period.
     */
    fun isHealthy(): Boolean =
        running && ((advertising && discovering) || System.currentTimeMillis() - startedAt < 15_000)

    fun stop() {
        running = false
        advertising = false
        discovering = false
        handler.removeCallbacksAndMessages(null)
        client.stopAdvertising()
        client.stopDiscovery()
        client.stopAllEndpoints()
        discovered.clear()
        connected.clear()
        pending.clear()
    }

    /**
     * Internet/battery changes are NOT re-advertised: restarting advertising closes the sockets
     * that accept incoming connections and breaks links being set up. Connected phones learn the
     * new state from the app's "hello" message instead.
     */
    fun updateInfo(info: PeerInfo) {
        localInfo = info
    }

    fun isConnected(endpointId: String) = connected.containsKey(endpointId)

    fun send(endpointId: String, data: String, onResult: (Boolean) -> Unit) {
        if (!connected.containsKey(endpointId)) {
            onResult(false)
            return
        }
        client.sendPayload(endpointId, Payload.fromBytes(data.toByteArray(Charsets.UTF_8)))
            .addOnSuccessListener { onResult(true) }
            .addOnFailureListener { e ->
                Log.w(tag, "sendPayload to $endpointId failed: ${e.message}")
                onResult(false)
            }
    }

    private fun startAdvertising() {
        // Only the stable BartaSetu ID is advertised (see updateInfo)
        val name = localInfo?.bsId ?: return
        val options = AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
        client.startAdvertising(name, SERVICE_ID, lifecycleCallback, options)
            .addOnSuccessListener {
                advertising = true
                Log.i(tag, "Advertising as $name")
            }
            .addOnFailureListener { e ->
                if (statusOf(e) == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) {
                    advertising = true
                    return@addOnFailureListener
                }
                advertising = false
                Log.w(tag, "Advertising failed (${statusOf(e)}): ${e.message}; retrying in 5 s")
                if (running) handler.postDelayed({ if (running && !advertising) startAdvertising() }, 5_000)
            }
    }

    private fun startDiscovery() {
        val options = DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
        client.startDiscovery(SERVICE_ID, discoveryCallback, options)
            .addOnSuccessListener {
                discovering = true
                Log.i(tag, "Discovery started")
            }
            .addOnFailureListener { e ->
                if (statusOf(e) == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                    discovering = true
                    return@addOnFailureListener
                }
                discovering = false
                Log.w(tag, "Discovery failed (${statusOf(e)}): ${e.message}; retrying in 5 s")
                if (running) handler.postDelayed({ if (running && !discovering) startDiscovery() }, 5_000)
            }
    }

    private fun statusOf(e: Exception): Int =
        (e as? com.google.android.gms.common.api.ApiException)?.statusCode ?: -1

    /**
     * Both phones discover each other; only the one with the smaller BartaSetu ID requests the
     * connection so the two sides do not collide with simultaneous requests.
     */
    private fun maybeConnect(endpointId: String, info: PeerInfo, force: Boolean = false) {
        val me = localInfo ?: return
        if (!running || connected.containsKey(endpointId) || pending.contains(endpointId)) return
        if (connected.size >= MAX_CONNECTIONS) return
        if (me.bsId >= info.bsId && !force) {
            // Discovery can be one-sided; if the other phone never requests, request ourselves.
            handler.postDelayed({
                discovered[endpointId]?.let { maybeConnect(endpointId, it, force = true) }
            }, 8_000)
            return
        }

        pending.add(endpointId)
        client.requestConnection(me.bsId, endpointId, lifecycleCallback)
            .addOnFailureListener { e ->
                pending.remove(endpointId)
                val attempt = (retries[endpointId] ?: 0) + 1
                retries[endpointId] = attempt
                Log.w(tag, "requestConnection to ${info.bsId} failed: ${e.message}")
                scheduleRetry(endpointId)
            }
    }

    /** Retry with growing delays while the phone is still discoverable (both sides may request). */
    private fun scheduleRetry(endpointId: String) {
        val attempt = (retries[endpointId] ?: 0) + 1
        retries[endpointId] = attempt
        if (attempt > MAX_RETRIES) return
        handler.postDelayed({
            discovered[endpointId]?.let { maybeConnect(endpointId, it, force = attempt >= 2) }
        }, 1_500L * attempt + (0..1_000).random())
    }

    private val discoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, endpointInfo: DiscoveredEndpointInfo) {
            val info = PeerInfo.decode(endpointInfo.endpointName) ?: return
            if (info.bsId == localInfo?.bsId) return
            discovered[endpointId] = info
            retries.remove(endpointId)
            Log.i(tag, "Found ${info.bsId} ($endpointId)")
            MeshEvents.peerFound(endpointId, TRANSPORT, info)
            maybeConnect(endpointId, info)
        }

        override fun onEndpointLost(endpointId: String) {
            discovered.remove(endpointId)
            if (!connected.containsKey(endpointId)) {
                MeshEvents.peerEvent(MeshEvents.PEER_LOST, endpointId, TRANSPORT)
            }
        }
    }

    private val lifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
            // Message bodies are end-to-end encrypted at the app layer, so links are accepted automatically.
            PeerInfo.decode(connectionInfo.endpointName)?.let { discovered[endpointId] = it }
            client.acceptConnection(endpointId, payloadCallback)
        }

        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            pending.remove(endpointId)
            if (result.status.statusCode == ConnectionsStatusCodes.STATUS_OK) {
                val info = discovered[endpointId] ?: PeerInfo("BS-UNKNOWN", false, 0)
                connected[endpointId] = info
                retries.remove(endpointId)
                Log.i(tag, "Connected to ${info.bsId} ($endpointId)")
                MeshEvents.emit(MeshEvents.PEER_CONNECTED) {
                    putString("peerId", endpointId)
                    putString("transport", TRANSPORT)
                    putString("bsId", info.bsId)
                    putBoolean("hasInternet", info.hasInternet)
                    putInt("battery", info.battery)
                }
            } else {
                Log.w(tag, "Connection to $endpointId failed: ${result.status.statusCode}")
                scheduleRetry(endpointId)
            }
        }

        override fun onDisconnected(endpointId: String) {
            connected.remove(endpointId)
            Log.i(tag, "Disconnected from $endpointId")
            MeshEvents.peerEvent(MeshEvents.PEER_DISCONNECTED, endpointId, TRANSPORT)
            // Try again if the phone is still in range
            discovered[endpointId]?.let { info -> handler.postDelayed({ maybeConnect(endpointId, info) }, 1_500) }
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type != Payload.Type.BYTES) return
            val bytes = payload.asBytes() ?: return
            MeshEvents.payload(endpointId, TRANSPORT, String(bytes, Charsets.UTF_8))
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }
}
