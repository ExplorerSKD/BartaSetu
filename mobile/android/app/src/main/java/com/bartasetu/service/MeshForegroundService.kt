package com.bartasetu.service

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.bartasetu.MainActivity
import com.bartasetu.ble.BleConstants

/**
 * Keeps the app process alive while the mesh relays messages in the background.
 * The radios themselves are owned by [MeshController].
 */
class MeshForegroundService : Service() {
    private val tag = "BartaSetu.MeshService"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startInForeground()
    }

    // Not sticky: if Android kills the process, the mesh restarts when the app is opened again
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                BleConstants.NOTIFICATION_CHANNEL_ID,
                BleConstants.NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps BartaSetu relaying messages between nearby phones"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun startInForeground() {
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, BleConstants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("BartaSetu is connected to nearby phones")
            .setContentText("Messages can travel phone-to-phone even without internet")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 14 requires the declared type to be passed explicitly
                startForeground(
                    BleConstants.NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                )
            } else {
                startForeground(BleConstants.NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // Missing runtime Bluetooth permission: keep running in the foreground of the app only
            Log.e(tag, "Could not enter foreground: ${e.message}")
            stopSelf()
        }
    }

    override fun onDestroy() {
        Log.i(tag, "Mesh foreground service stopped")
        super.onDestroy()
    }

    // Swiping the app away from recents no longer stops the radios: the mesh keeps relaying
    // as long as Android keeps the process alive. (Previously this silently stopped the mesh.)

    override fun onBind(intent: Intent?): IBinder? = null
}
