package com.bartasetu.mesh

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.bartasetu.ble.BleConstants
import com.bartasetu.ble.BleTransport

/**
 * Owns both transports for the lifetime of the app process.
 * Nearby Connections is the primary link; raw BLE GATT runs alongside as a fallback
 * (for phones without Google Play Services, or when a Nearby link cannot be established).
 *
 * Self-healing: radios are restarted when Bluetooth / airplane mode is switched back on, and a
 * watchdog restarts Nearby whenever advertising or discovery has stopped. Without this, toggling
 * airplane mode silently left the phone invisible to everyone nearby.
 */
object MeshController {
    private const val TAG = "BartaSetu.Mesh"
    private const val WATCHDOG_MS = 20_000L

    private var nearby: NearbyTransport? = null
    private var ble: BleTransport? = null
    private var appContext: Context? = null
    private var wantNearby = false
    private var wantBle = false
    private var wanted = false
    private var receiverRegistered = false
    private val handler = Handler(Looper.getMainLooper())

    var localInfo: PeerInfo? = null
        private set

    val isRunning: Boolean get() = nearby != null || ble != null

    data class StartResult(val nearby: Boolean, val ble: Boolean)

    @Synchronized
    fun start(context: Context, info: PeerInfo, useNearby: Boolean, useBle: Boolean): StartResult {
        appContext = context.applicationContext
        localInfo = info
        wantNearby = useNearby
        wantBle = useBle
        wanted = true
        registerBluetoothReceiver()
        scheduleWatchdog()
        val result = ensureRunning()
        Log.i(TAG, "Mesh started for ${info.bsId}: $result")
        return result
    }

    /** Start whatever should be running but is not. Safe to call any time. */
    @Synchronized
    fun ensureRunning(): StartResult {
        val ctx = appContext
        val info = localInfo
        if (!wanted || ctx == null || info == null) return StartResult(false, false)
        val bluetoothOn = isBluetoothOn(ctx)

        if (wantNearby && NearbyTransport.isAvailable(ctx)) {
            val current = nearby
            if (current == null) {
                nearby = NearbyTransport(ctx).also { it.start(info) }
            } else if (bluetoothOn && !current.isHealthy()) {
                Log.w(TAG, "Nearby not advertising/discovering; restarting it")
                current.stop()
                nearby = NearbyTransport(ctx).also { it.start(info) }
            }
        }

        if (wantBle) {
            if (bluetoothOn && ble == null) {
                val transport = BleTransport(ctx)
                if (transport.start(info)) ble = transport
            } else if (!bluetoothOn && ble != null) {
                ble?.stop()
                ble = null
            }
        }

        val result = status()
        MeshEvents.emit(MeshEvents.TRANSPORT_STATE) {
            putBoolean("nearby", result.nearby)
            putBoolean("ble", result.ble)
        }
        return result
    }

    fun status(): StartResult = StartResult(nearby = nearby?.isHealthy() == true, ble = ble != null)

    @Synchronized
    fun updateInfo(info: PeerInfo) {
        localInfo = info
        nearby?.updateInfo(info)
        ble?.updateInfo(info)
    }

    fun send(peerId: String, transport: String, data: String, onResult: (Boolean) -> Unit) {
        when (transport) {
            NearbyTransport.TRANSPORT -> nearby?.send(peerId, data, onResult) ?: onResult(false)
            BleConstants.TRANSPORT -> ble?.send(peerId, data, onResult) ?: onResult(false)
            else -> onResult(false)
        }
    }

    @Synchronized
    fun stop() {
        wanted = false
        handler.removeCallbacksAndMessages(null)
        unregisterBluetoothReceiver()
        stopTransports()
        Log.i(TAG, "Mesh stopped")
    }

    @Synchronized
    private fun stopTransports() {
        nearby?.stop()
        ble?.stop()
        nearby = null
        ble = null
    }

    @Synchronized
    private fun restartTransports(reason: String) {
        if (!wanted) return
        Log.i(TAG, "Restarting radios: $reason")
        stopTransports()
        ensureRunning()
    }

    private fun scheduleWatchdog() {
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, WATCHDOG_MS)
    }

    private val watchdog = object : Runnable {
        override fun run() {
            if (!wanted) return
            ensureRunning()
            handler.postDelayed(this, WATCHDOG_MS)
        }
    }

    private fun isBluetoothOn(ctx: Context): Boolean {
        val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter?.isEnabled == true
    }

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    when (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)) {
                        BluetoothAdapter.STATE_ON ->
                            handler.postDelayed({ restartTransports("Bluetooth turned on") }, 1_500)
                        BluetoothAdapter.STATE_OFF -> {
                            Log.i(TAG, "Bluetooth turned off; radios paused until it is back")
                            ensureRunning()
                        }
                    }
                }
                Intent.ACTION_AIRPLANE_MODE_CHANGED ->
                    handler.postDelayed({ restartTransports("airplane mode changed") }, 3_000)
            }
        }
    }

    private fun registerBluetoothReceiver() {
        val ctx = appContext ?: return
        if (receiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(Intent.ACTION_AIRPLANE_MODE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            ctx.registerReceiver(bluetoothReceiver, filter)
        }
        receiverRegistered = true
    }

    private fun unregisterBluetoothReceiver() {
        val ctx = appContext ?: return
        if (!receiverRegistered) return
        try {
            ctx.unregisterReceiver(bluetoothReceiver)
        } catch (_: IllegalArgumentException) {
        }
        receiverRegistered = false
    }
}
