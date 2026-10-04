package com.bartasetu.ble

import java.util.UUID

object BleConstants {
    // Custom 128-bit BartaSetu UUIDs (must be valid hex; the old "0000barta-..." values crashed UUID.fromString)
    val SERVICE_UUID: UUID = UUID.fromString("7b1c0000-4f2a-4b8e-9d3c-5a6e8f1b2c3d")

    // Characteristics
    val CHAR_MESSAGE_WRITE: UUID = UUID.fromString("7b1c0001-4f2a-4b8e-9d3c-5a6e8f1b2c3d")
    val CHAR_HANDSHAKE: UUID = UUID.fromString("7b1c0004-4f2a-4b8e-9d3c-5a6e8f1b2c3d")

    const val TRANSPORT = "ble"

    // Advertised service data: [flags, battery, 6 ASCII chars of the BartaSetu ID]
    const val FLAG_HAS_INTERNET = 0x01
    const val SERVICE_DATA_LENGTH = 8

    // MTU Configuration
    const val MAX_MTU = 512
    const val DEFAULT_MTU = 23

    // Timings
    const val SCAN_PERIOD_MS = 10_000L
    const val SCAN_INTERVAL_MS = 5_000L
    const val CONNECTION_TIMEOUT_MS = 15_000L
    const val PEER_EXPIRY_MS = 45_000L
    const val MAX_RETRIES = 3

    // Notifications
    const val NOTIFICATION_CHANNEL_ID = "bartasetu_mesh_service_channel"
    const val NOTIFICATION_CHANNEL_NAME = "BartaSetu Mesh Service"
    const val NOTIFICATION_ID = 1001
}
