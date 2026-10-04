package com.bartasetu.ble

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.util.Log
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

/**
 * Serializes GATT transfers per peer (one connection at a time per device) and retries failures.
 */
class BleConnectionManager(private val context: Context) {
    private val tag = "BartaSetu.BleConnectionManager"
    private val activeClients = ConcurrentHashMap<String, GattClient>()
    private val queues = ConcurrentHashMap<String, ArrayDeque<Transfer>>()

    private class Transfer(val payload: ByteArray, val onComplete: (Boolean) -> Unit, var attempt: Int = 0)

    fun transmitMessage(
        device: BluetoothDevice,
        payloadBytes: ByteArray,
        onComplete: (success: Boolean) -> Unit
    ) {
        val queue = queues.getOrPut(device.address) { ArrayDeque() }
        synchronized(queue) { queue.addLast(Transfer(payloadBytes, onComplete)) }
        pump(device)
    }

    private fun pump(device: BluetoothDevice) {
        val address = device.address
        if (activeClients.containsKey(address)) return
        val queue = queues[address] ?: return
        val transfer = synchronized(queue) { queue.pollFirst() } ?: return

        val client = GattClient(context, device, transfer.payload) { success ->
            activeClients.remove(address)
            if (!success && ++transfer.attempt < BleConstants.MAX_RETRIES) {
                Log.w(tag, "Retrying transfer to $address (attempt ${transfer.attempt + 1})")
                synchronized(queue) { queue.addFirst(transfer) }
            } else {
                transfer.onComplete(success)
            }
            pump(device)
        }
        activeClients[address] = client
        client.connect()
    }

    fun disconnectAll() {
        // Drop queues first so cancelled transfers are not retried
        queues.clear()
        activeClients.values.forEach { it.cancel() }
        activeClients.clear()
    }
}
