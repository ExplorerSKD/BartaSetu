package com.bartasetu.service

import android.annotation.SuppressLint
import android.app.*
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.bartasetu.ble.*

class BleForegroundService : Service() {
    private val tag = "BartaSetu.MeshService"
    private var scanner: BleScanner? = null
    private var advertiser: BleAdvertiser? = null
    private var gattServer: GattServer? = null
    private var connectionManager: BleConnectionManager? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForegroundNotification()

        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter

        if (adapter != null && adapter.isEnabled) {
            connectionManager = BleConnectionManager(this)

            gattServer = GattServer(this, bluetoothManager) { rawMessage, peerAddress ->
                BleModule.emitEvent("onMessageReceived", rawMessage)
            }
            gattServer?.startServer()

            advertiser = BleAdvertiser(adapter)
            advertiser?.startAdvertising()

            scanner = BleScanner(adapter) { device, rssi, scanRecord ->
                BleModule.emitEvent("onDeviceDiscovered", mapOf(
                    "id" to device.address,
                    "name" to (device.name ?: "Unknown Peer"),
                    "rssi" to rssi
                ))
            }
            scanner?.startScanning()

            Log.i(tag, "BartaSetu Mesh Foreground Service fully started")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                BleConstants.NOTIFICATION_CHANNEL_ID,
                BleConstants.NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "BartaSetu Background Mesh Relay Network"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val notification = NotificationCompat.Builder(this, BleConstants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("BartaSetu Mesh Active")
            .setContentText("Relaying offline emergency messages via BLE")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(BleConstants.NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        scanner?.stopScanning()
        advertiser?.stopAdvertising()
        gattServer?.stopServer()
        connectionManager?.disconnectAll()
        super.onDestroy()
        Log.i(tag, "BartaSetu Mesh Foreground Service stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
