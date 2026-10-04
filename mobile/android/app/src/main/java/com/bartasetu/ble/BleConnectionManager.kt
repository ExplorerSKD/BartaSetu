package com.bartasetu.ble

import android.bluetooth.BluetoothDevice
import android.content.Context
import java.util.concurrent.ConcurrentHashMap

class BleConnectionManager(private val context: Context) {
    private val activeClients = ConcurrentHashMap<String, GattClient>()
    private val retryCounts = ConcurrentHashMap<String, Int>()

    fun connectDevice(device: BluetoothDevice) {
        val address = device.address
        if (activeClients.containsKey(address)) return

        val client = GattClient(context, device) { disconnectedAddress ->
            handleDisconnect(disconnectedAddress, device)
        }
        activeClients[address] = client
        retryCounts[address] = 0
        client.connect()
    }

    private fun handleDisconnect(address: String, device: BluetoothDevice) {
        activeClients.remove(address)
        val currentRetries = retryCounts[address] ?: 0
        if (currentRetries < BleConstants.MAX_RETRIES) {
            retryCounts[address] = currentRetries + 1
            // Optional delay before reconnect
            connectDevice(device)
        } else {
            retryCounts.remove(address)
        }
    }

    fun sendMessageToAll(message: String) {
        activeClients.values.forEach { client ->
            client.sendMessage(message)
        }
    }
    
    fun sendMessageToDevice(address: String, message: String) {
        activeClients[address]?.sendMessage(message)
    }

    fun disconnectAll() {
        activeClients.values.forEach { it.close() }
        activeClients.clear()
        retryCounts.clear()
    }
}
