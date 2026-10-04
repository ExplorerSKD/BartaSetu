package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.util.LinkedList
import java.util.Queue
import java.util.UUID

@SuppressLint("MissingPermission")
class GattClient(
    private val context: Context,
    private val device: BluetoothDevice,
    private val onDisconnected: (String) -> Unit
) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var currentMtu = BleConstants.DEFAULT_MTU
    
    private val commandQueue: Queue<Runnable> = LinkedList()
    private var isExecuting = false
    private val handlerThread = HandlerThread("GattClientThread_${device.address}").apply { start() }
    private val handler = Handler(handlerThread.looper)

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                enqueueCommand { gatt.requestMtu(BleConstants.MAX_MTU) }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                close()
                onDisconnected(device.address)
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                currentMtu = mtu
            }
            completedCommand()
            enqueueCommand { gatt.discoverServices() }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            completedCommand()
            if (status == BluetoothGatt.GATT_SUCCESS) {
                // Ready for communication
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            completedCommand()
        }
        
        override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            completedCommand()
        }
    }
    
    fun connect() {
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }
    
    fun sendMessage(message: String) {
        val payload = message.toByteArray(Charsets.UTF_8)
        val chunks = BleDataProtocol.chunkPayload(payload, currentMtu)
        
        chunks.forEach { chunk ->
            enqueueCommand {
                val service = bluetoothGatt?.getService(BleConstants.SERVICE_UUID)
                val characteristic = service?.getCharacteristic(BleConstants.CHAR_MESSAGE_WRITE)
                if (characteristic != null) {
                    characteristic.value = chunk
                    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    bluetoothGatt?.writeCharacteristic(characteristic)
                } else {
                    completedCommand()
                }
            }
        }
    }

    private fun enqueueCommand(command: () -> Unit) {
        synchronized(commandQueue) {
            commandQueue.add(Runnable { command() })
            executeNext()
        }
    }

    private fun executeNext() {
        synchronized(commandQueue) {
            if (isExecuting) return
            val nextCommand = commandQueue.poll()
            if (nextCommand != null) {
                isExecuting = true
                handler.post(nextCommand)
                
                // Add a timeout just in case the callback is never fired
                handler.postDelayed({
                    if (isExecuting) {
                        completedCommand()
                    }
                }, 5000)
            }
        }
    }

    private fun completedCommand() {
        synchronized(commandQueue) {
            isExecuting = false
            handler.removeCallbacksAndMessages(null)
            executeNext()
        }
    }
    
    fun close() {
        bluetoothGatt?.close()
        bluetoothGatt = null
        handlerThread.quitSafely()
    }
}
