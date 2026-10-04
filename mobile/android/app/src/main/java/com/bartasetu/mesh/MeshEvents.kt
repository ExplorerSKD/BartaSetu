package com.bartasetu.mesh

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Single bridge from the native transports to JavaScript.
 * Every event carries `peerId` + `transport` ("nearby" | "ble") so JS can route replies.
 */
object MeshEvents {
    const val PEER_FOUND = "MeshPeerFound"
    const val PEER_LOST = "MeshPeerLost"
    const val PEER_CONNECTED = "MeshPeerConnected"
    const val PEER_DISCONNECTED = "MeshPeerDisconnected"
    const val PAYLOAD = "MeshPayload"
    const val TRANSPORT_STATE = "MeshTransportState"

    @Volatile
    var reactContext: ReactApplicationContext? = null

    fun emit(eventName: String, build: WritableMap.() -> Unit) {
        val context = reactContext ?: return
        if (!context.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply(build)
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    fun peerFound(peerId: String, transport: String, info: PeerInfo?, rssi: Int? = null) = emit(PEER_FOUND) {
        putString("peerId", peerId)
        putString("transport", transport)
        info?.let {
            putString("bsId", it.bsId)
            putBoolean("hasInternet", it.hasInternet)
            putInt("battery", it.battery)
        }
        rssi?.let { putInt("rssi", it) }
    }

    fun peerEvent(eventName: String, peerId: String, transport: String) = emit(eventName) {
        putString("peerId", peerId)
        putString("transport", transport)
    }

    fun payload(peerId: String, transport: String, data: String) = emit(PAYLOAD) {
        putString("peerId", peerId)
        putString("transport", transport)
        putString("data", data)
    }
}

/** What a phone advertises about itself before any connection is made. */
data class PeerInfo(val bsId: String, val hasInternet: Boolean, val battery: Int) {
    companion object {
        /** Nearby endpoint names are the BartaSetu ID ("BS-7K3Q9X"); older builds appended "|internet|battery". */
        fun decode(raw: String?): PeerInfo? {
            val parts = raw?.split("|") ?: return null
            if (!parts[0].startsWith("BS-")) return null
            return PeerInfo(
                bsId = parts[0],
                hasInternet = parts.getOrNull(1) == "1",
                battery = parts.getOrNull(2)?.toIntOrNull() ?: 100,
            )
        }
    }
}
