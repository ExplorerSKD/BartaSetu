package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Delivers one payload to a peer's GATT server:
 * connect -> negotiate MTU -> discover services -> write chunks one at a time -> disconnect.
 * [onTransferComplete] is called exactly once.
 */
class GattClient(
    private val context: Context,
    private val device: BluetoothDevice,
    private val payloadBytes: ByteArray,
    private val onTransferComplete: (success: Boolean) -> Unit
) {
    private val tag = "BartaSetu.GattClient"
    private val handler = Handler(Looper.getMainLooper())
    private val finished = AtomicBoolean(false)
    private var gatt: BluetoothGatt? = null
    private var chunks: List<ByteArray> = emptyList()
    private var nextChunk = 0

    private val timeout = Runnable {
        Log.w(tag, "Transfer to ${device.address} timed out")
        finish(false)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.requestMtu(BleConstants.MAX_MTU)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
                finish(false)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            val effectiveMtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else BleConstants.DEFAULT_MTU
            chunks = BleDataProtocol.chunkPayload(payloadBytes, effectiveMtu)
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                finish(false)
                return
            }
            writeNext()
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                finish(false)
                return
            }
            writeNext()
        }
    }

    @SuppressLint("MissingPermission")
    fun connect() {
        handler.postDelayed(timeout, BleConstants.CONNECTION_TIMEOUT_MS)
        gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun writeNext() {
        if (nextChunk >= chunks.size) {
            Log.i(tag, "Delivered ${chunks.size} chunks to ${device.address}")
            finish(true)
            return
        }
        val characteristic = gatt?.getService(BleConstants.SERVICE_UUID)
            ?.getCharacteristic(BleConstants.CHAR_MESSAGE_WRITE)
        if (characteristic == null) {
            Log.e(tag, "BartaSetu service not found on ${device.address}")
            finish(false)
            return
        }
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        characteristic.value = chunks[nextChunk++]
        if (gatt?.writeCharacteristic(characteristic) != true) {
            finish(false)
        }
    }

    @SuppressLint("MissingPermission")
    private fun finish(success: Boolean) {
        if (!finished.compareAndSet(false, true)) return
        handler.removeCallbacks(timeout)
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.e(tag, "Error closing GATT: ${e.message}")
        }
        gatt = null
        onTransferComplete(success)
    }

    fun cancel() = finish(false)
}
