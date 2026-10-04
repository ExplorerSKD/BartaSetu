package com.bartasetu.mesh

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.bartasetu.service.MeshForegroundService
import com.facebook.react.bridge.*

/**
 * React Native entry point for the offline mesh (exposed to JS as NativeModules.MeshModule).
 *
 * JS API:
 *   isNearbyAvailable(): Promise<boolean>
 *   start({ bsId, hasInternet, battery, useNearby, useBle }): Promise<{ nearby, ble }>
 *   updateLocalInfo({ bsId, hasInternet, battery }): void
 *   send(peerId, transport, data): Promise<boolean>
 *   stop(): Promise<boolean>
 * Events: MeshPeerFound, MeshPeerLost, MeshPeerConnected, MeshPeerDisconnected, MeshPayload, MeshTransportState
 */
class MeshModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        MeshEvents.reactContext = reactContext
    }

    override fun getName(): String = "MeshModule"

    @ReactMethod
    fun isNearbyAvailable(promise: Promise) {
        promise.resolve(NearbyTransport.isAvailable(reactContext))
    }

    @ReactMethod
    fun start(config: ReadableMap, promise: Promise) {
        try {
            val info = readInfo(config) ?: return promise.reject("E_CONFIG", "bsId is required")
            val useNearby = !config.hasKey("useNearby") || config.getBoolean("useNearby")
            val useBle = !config.hasKey("useBle") || config.getBoolean("useBle")

            // The foreground service keeps the process (and the radios) alive in the background.
            // Android 14 refuses a connectedDevice foreground service without Bluetooth permission,
            // so without it the mesh only runs while the app is open.
            if (hasBluetoothPermission()) {
                val intent = Intent(reactContext, MeshForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    reactContext.startForegroundService(intent)
                } else {
                    reactContext.startService(intent)
                }
            }

            val result = MeshController.start(reactContext, info, useNearby, useBle)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("nearby", result.nearby)
                putBoolean("ble", result.ble)
            })
        } catch (e: Exception) {
            promise.reject("E_START", e.message, e)
        }
    }

    @ReactMethod
    fun updateLocalInfo(config: ReadableMap) {
        readInfo(config)?.let { MeshController.updateInfo(it) }
    }

    @ReactMethod
    fun send(peerId: String, transport: String, data: String, promise: Promise) {
        MeshController.send(peerId, transport, data) { ok -> promise.resolve(ok) }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        MeshController.stop()
        reactContext.stopService(Intent(reactContext, MeshForegroundService::class.java))
        promise.resolve(true)
    }

    /** Restart anything that should be running but is not; resolves the real radio state. */
    @ReactMethod
    fun ensureRunning(promise: Promise) {
        val result = MeshController.ensureRunning()
        promise.resolve(Arguments.createMap().apply {
            putBoolean("nearby", result.nearby)
            putBoolean("ble", result.ble)
            putBoolean("bluetoothOn", bluetoothOn())
            putBoolean("backgroundAllowed", backgroundAllowed())
        })
    }

    /** Ask Android not to kill BartaSetu in the background (vivo/Xiaomi/etc. do this aggressively). */
    @ReactMethod
    fun requestBackgroundRun() {
        try {
            val intent = if (!backgroundAllowed()) {
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${reactContext.packageName}"))
            } else {
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
        } catch (_: Exception) {
            val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${reactContext.packageName}"))
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(fallback)
        }
    }

    private fun backgroundAllowed(): Boolean {
        val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
    }

    private fun bluetoothOn(): Boolean {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager
        return manager?.adapter?.isEnabled == true
    }

    /** kind: "sos" | "message" */
    @ReactMethod
    fun showNotification(kind: String, title: String, body: String) {
        MeshNotifier.show(reactContext, kind, title, body)
    }

    // Required by NativeEventEmitter on the JS side
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun hasBluetoothPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return listOf(
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_ADVERTISE,
        ).all { ContextCompat.checkSelfPermission(reactContext, it) == PackageManager.PERMISSION_GRANTED }
    }

    private fun readInfo(map: ReadableMap): PeerInfo? {
        val bsId = if (map.hasKey("bsId")) map.getString("bsId") else MeshController.localInfo?.bsId
        if (bsId.isNullOrBlank()) return null
        val hasInternet = if (map.hasKey("hasInternet")) map.getBoolean("hasInternet") else false
        val battery = if (map.hasKey("battery")) map.getInt("battery") else 100
        return PeerInfo(bsId, hasInternet, battery)
    }
}
