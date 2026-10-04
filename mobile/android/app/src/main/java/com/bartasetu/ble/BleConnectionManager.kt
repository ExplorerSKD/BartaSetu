package com.bartasetu.ble

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

class BleConnectionManager(private val context: Context) {
    private val tag = "BartaSetu.BleConnectionManager"
    private val activeClients = ConcurrentHashMap<String, GattClient>()

    fun transmitMessage(
        device: BluetoothDevice,
        payloadBytes: ByteArray,
        onComplete: (success: Boolean) -> Unit
    ) {
        val address = device.address
        Log.i(tag, "Initiating transmission to peer: $address")

        val client = GattClient(context, device) { success ->
            activeClients.remove(address)
            onComplete(success)
        }

        activeClients[address] = client
        client.connect()
        client.enqueuePayload(payloadBytes)
    }

    fun disconnectAll() {
        for ((_, client) in activeClients) {
            client.cleanup()
        }
        activeClients.clear()
    }
}
