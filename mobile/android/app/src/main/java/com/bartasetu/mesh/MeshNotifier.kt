package com.bartasetu.mesh

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bartasetu.MainActivity

/**
 * Heads-up notifications for things that arrive over the mesh (SOS alerts, messages),
 * so people see them even when BartaSetu is in the background.
 */
object MeshNotifier {
    private const val CHANNEL_SOS = "bartasetu_sos"
    private const val CHANNEL_MESSAGES = "bartasetu_messages"

    private fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_SOS, "Emergency SOS alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "SOS alerts from people near you"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 600, 200, 600, 200, 600)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "New BartaSetu messages"
            }
        )
    }

    fun show(context: Context, kind: String, title: String, body: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        ensureChannels(context)
        val isSos = kind == "sos"
        val openApp = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, if (isSos) CHANNEL_SOS else CHANNEL_MESSAGES)
            .setSmallIcon(if (isSos) android.R.drawable.stat_sys_warning else android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (isSos) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (isSos) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_MESSAGE)
            .setColor(if (isSos) 0xFFDC2626.toInt() else 0xFF059669.toInt())
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .build()
        try {
            NotificationManagerCompat.from(context).notify((title + body).hashCode(), notification)
        } catch (_: SecurityException) {
            // Notification permission revoked
        }
    }
}
