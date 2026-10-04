package com.bartasetu.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.bartasetu.mesh.MeshEvents
import com.bartasetu.mesh.PeerInfo
import java.util.concurrent.ConcurrentHashMap

/**
 * Fallback transport using raw BLE: advertise + scan for the BartaSetu service and push
 * payloads into the peer's GATT server. Used when Nearby Connections is unavailable.
 * BLE peers are "reachable" while recently seen; there is no persistent connection.
 */
class BleTransport(private val context: Context) {
    private val tag = "BartaSetu.BleTransport"
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager.adapter
    private val handler = Handler(Looper.getMainLooper())

    private var scanner: BleScanner? = null
    private var advertiser: BleAdvertiser? = null
    private var gattServer: GattServer? = null
    private var connectionManager: BleConnectionManager? = null
    private var localInfo: PeerInfo? = null

    private data class SeenPeer(val device: BluetoothDevice, val info: PeerInfo?, val lastSeen: Long)
    private val peers = ConcurrentHashMap<String, SeenPeer>()
    private val reportedAt = ConcurrentHashMap<String, Long>()

    private val expirySweep = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            peers.entries.removeIf { (address, peer) ->
                val expired = now - peer.lastSeen > BleConstants.PEER_EXPIRY_MS
                if (expired) {
                    reportedAt.remove(address)
                    MeshEvents.peerEvent(MeshEvents.PEER_LOST, address, BleConstants.TRANSPORT)
                }
                expired
            }
            handler.postDelayed(this, 10_000)
        }
    }

    fun isSupported(): Boolean = adapter != null && adapter.isEnabled &&
        context.packageManager.hasSystemFeature("android.hardware.bluetooth_le")

    fun start(info: PeerInfo): Boolean {
        localInfo = info
        val bt = adapter
        if (bt == null || !bt.isEnabled) {
            Log.w(tag, "Bluetooth is off or unavailable; BLE fallback not started")
            return false
        }

        connectionManager = BleConnectionManager(context)
        gattServer = GattServer(context, bluetoothManager) { raw, address ->
            MeshEvents.payload(address, BleConstants.TRANSPORT, raw)
        }.also { it.startServer() }

        advertiser = BleAdvertiser(bt).also { it.startAdvertising(info) }

        scanner = BleScanner(bt) { device, rssi, peerInfo ->
            if (peerInfo?.bsId == localInfo?.bsId) return@BleScanner
            val now = System.currentTimeMillis()
            val previous = peers[device.address]
            val info = peerInfo ?: previous?.info
            peers[device.address] = SeenPeer(device, info, now)
            // Low-latency scans report many times per second; tell JS about new peers right away
            // and refresh known ones (RSSI, internet flag) at most every 5 seconds.
            val lastReported = reportedAt[device.address] ?: 0L
            if (previous == null || now - lastReported > 5_000) {
                reportedAt[device.address] = now
                MeshEvents.peerFound(device.address, BleConstants.TRANSPORT, info, rssi)
            }
        }.also { it.startScanning() }

        handler.postDelayed(expirySweep, 10_000)
        Log.i(tag, "BLE fallback transport started")
        return true
    }

    fun updateInfo(info: PeerInfo) {
        if (info == localInfo) return
        localInfo = info
        advertiser?.startAdvertising(info)
    }

    fun send(address: String, data: String, onResult: (Boolean) -> Unit) {
        val manager = connectionManager
        val device = peers[address]?.device
            ?: runCatching { adapter?.getRemoteDevice(address) }.getOrNull()
        if (manager == null || device == null) {
            onResult(false)
            return
        }
        manager.transmitMessage(device, data.toByteArray(Charsets.UTF_8), onResult)
    }

    fun stop() {
        handler.removeCallbacksAndMessages(null)
        scanner?.stopScanning()
        advertiser?.stopAdvertising()
        gattServer?.stopServer()
        connectionManager?.disconnectAll()
        scanner = null
        advertiser = null
        gattServer = null
        connectionManager = null
        peers.clear()
        reportedAt.clear()
    }
}
