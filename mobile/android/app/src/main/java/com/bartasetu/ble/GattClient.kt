package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue

class GattClient(
    private val context: Context,
    private val device: BluetoothDevice,
    private val onTransferComplete: (success: Boolean) -> Unit
) {
    private val tag = "BartaSetu.GattClient"
    private var gatt: BluetoothGatt? = null
    private var currentMtu = BleConstants.DEFAULT_MTU

    // Sequential GATT command queue prevents race conditions
    private val commandQueue = ConcurrentLinkedQueue<Runnable>()
    private var isExecutingCommand = false
    private val handlerThread = HandlerThread("GattClientQueue-${device.address}").apply { start() }
    private val queueHandler = Handler(handlerThread.looper)

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(tag, "Connected to GATT server on ${device.address}. Requesting MTU 512...")
                gatt?.requestMtu(BleConstants.MAX_MTU)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(tag, "Disconnected from ${device.address}")
                cleanup()
                onTransferComplete(false)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onMtuChanged(gatt: BluetoothGatt?, mtu: Int, status: Int) {
            currentMtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else BleConstants.DEFAULT_MTU
            Log.i(tag, "Negotiated MTU: $currentMtu with ${device.address}. Discovering services...")
            gatt?.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(tag, "Services discovered on ${device.address}. Ready to transmit.")
                processNextCommand()
            } else {
                Log.e(tag, "Service discovery failed on ${device.address}")
                cleanup()
                onTransferComplete(false)
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
            status: Int
        ) {
            isExecutingCommand = false
            processNextCommand()
        }
    }

    @SuppressLint("MissingPermission")
    fun connect() {
        gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    fun enqueuePayload(payloadBytes: ByteArray) {
        val chunks = BleDataProtocol.chunkPayload(payloadBytes, currentMtu)
        Log.i(tag, "Queueing ${chunks.size} chunks for transmission to ${device.address}")

        for ((index, chunk) in chunks.withIndex()) {
            commandQueue.add(Runnable {
                writeChunk(chunk, isLast = (index == chunks.size - 1))
            })
        }
        processNextCommand()
    }

    @SuppressLint("MissingPermission")
    private fun writeChunk(chunk: ByteArray, isLast: Boolean) {
        val service = gatt?.getService(BleConstants.SERVICE_UUID)
        val charWrite = service?.getCharacteristic(BleConstants.CHAR_MESSAGE_WRITE)
        if (charWrite == null) {
            Log.e(tag, "Write characteristic not found")
            onTransferComplete(false)
            cleanup()
            return
        }

        charWrite.value = chunk
        charWrite.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        val initiated = gatt?.writeCharacteristic(charWrite) ?: false

        if (!initiated) {
            Log.e(tag, "Failed to initiate chunk write")
            onTransferComplete(false)
            cleanup()
        } else if (isLast) {
            Log.i(tag, "All chunks transmitted successfully to ${device.address}")
            onTransferComplete(true)
            cleanup()
        }
    }

    private fun processNextCommand() {
        queueHandler.post {
            if (isExecutingCommand || commandQueue.isEmpty()) return@post
            val command = commandQueue.poll()
            if (command != null) {
                isExecutingCommand = true
                command.run()
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun cleanup() {
        try {
            gatt?.disconnect()
            gatt?.close()
            gatt = null
            handlerThread.quitSafely()
        } catch (e: Exception) {
            Log.e(tag, "Error cleaning up GattClient: ${e.message}")
        }
    }
}
