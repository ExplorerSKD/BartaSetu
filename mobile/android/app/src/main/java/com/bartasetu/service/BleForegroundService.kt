package com.bartasetu.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.bartasetu.ble.*

class BleForegroundService : Service() {

    private lateinit var bleScanner: BleScanner
    private lateinit var bleAdvertiser: BleAdvertiser
    private lateinit var gattServer: GattServer
    private lateinit var bleConnectionManager: BleConnectionManager

    override fun onCreate() {
        super.onCreate()
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val bluetoothAdapter = bluetoothManager.adapter

        bleConnectionManager = BleConnectionManager(this)

        bleScanner = BleScanner(this, bluetoothAdapter) { device, rssi, scanRecord ->
            // Connect to discovered device for mesh network
            bleConnectionManager.connectDevice(device)
        }

        bleAdvertiser = BleAdvertiser(this, bluetoothAdapter)

        gattServer = GattServer(this, bluetoothManager) { message, senderAddress ->
            // Broadcast message received (could use LocalBroadcastManager or EventBus)
            val intent = Intent("com.bartasetu.ble.MESSAGE_RECEIVED")
            intent.putExtra("message", message)
            intent.putExtra("sender", senderAddress)
            sendBroadcast(intent)
            
            // Relay to other connected devices in mesh
            bleConnectionManager.sendMessageToAll(message)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, BleConstants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("BartaSetu Mesh Active")
            .setContentText("Scanning and relaying messages")
            .setSmallIcon(android.R.drawable.ic_dialog_info) // Replace with app icon
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                BleConstants.NOTIFICATION_ID, 
                notification, 
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } else {
            startForeground(BleConstants.NOTIFICATION_ID, notification)
        }

        bleScanner.startScanning()
        bleAdvertiser.startAdvertising("BartaSetu Node", true, 100)
        gattServer.startServer()

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        bleScanner.stopScanning()
        bleAdvertiser.stopAdvertising()
        gattServer.stopServer()
        bleConnectionManager.disconnectAll()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                BleConstants.NOTIFICATION_CHANNEL_ID,
                "BartaSetu Mesh Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
