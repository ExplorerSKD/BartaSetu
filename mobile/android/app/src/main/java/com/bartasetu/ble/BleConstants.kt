package com.bartasetu.ble

import java.util.UUID

object BleConstants {
    // Custom BartaSetu BLE Service UUID
    val SERVICE_UUID: UUID = UUID.fromString("0000barta-0000-1000-8000-00805f9b34fb")

    // Characteristics
    val CHAR_MESSAGE_WRITE: UUID = UUID.fromString("0001barta-0000-1000-8000-00805f9b34fb")
    val CHAR_MESSAGE_IDS: UUID = UUID.fromString("0002barta-0000-1000-8000-00805f9b34fb")
    val CHAR_DEVICE_INFO: UUID = UUID.fromString("0003barta-0000-1000-8000-00805f9b34fb")
    val CHAR_HANDSHAKE: UUID = UUID.fromString("0004barta-0000-1000-8000-00805f9b34fb")

    // MTU Configuration
    const val MAX_MTU = 512
    const val DEFAULT_MTU = 23

    // Timings
    const val SCAN_PERIOD_MS = 10_000L
    const val SCAN_INTERVAL_MS = 5_000L
    const val CONNECTION_TIMEOUT_MS = 30_000L
    const val MAX_RETRIES = 3

    // Notifications
    const val NOTIFICATION_CHANNEL_ID = "bartasetu_mesh_service_channel"
    const val NOTIFICATION_CHANNEL_NAME = "BartaSetu Mesh Service"
    const val NOTIFICATION_ID = 1001
}
