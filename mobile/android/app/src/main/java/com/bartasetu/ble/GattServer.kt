package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.util.Log

class GattServer(
    private val context: Context,
    private val bluetoothManager: BluetoothManager,
    private val onMessageReceived: (rawMessage: String, peerAddress: String) -> Unit
) {
    private val tag = "BartaSetu.GattServer"
    private var gattServer: BluetoothGattServer? = null

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            Log.d(tag, "Peer ${device?.address} connection state: $newState, status: $status")
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
            }

            if (characteristic?.uuid == BleConstants.CHAR_MESSAGE_WRITE && value != null && device != null) {
                val completePayload = BleDataProtocol.reassembleChunk(value, device.address)
                if (completePayload != null) {
                    val messageString = String(completePayload, Charsets.UTF_8)
                    Log.i(tag, "Complete message received from ${device.address}: ${messageString.take(40)}...")
                    onMessageReceived(messageString, device.address)
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicReadRequest(
            device: BluetoothDevice?,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic?
        ) {
            val responseData = when (characteristic?.uuid) {
                BleConstants.CHAR_HANDSHAKE -> "BARTA_V1_OK".toByteArray()
                BleConstants.CHAR_DEVICE_INFO -> "ANDROID_NODE".toByteArray()
                else -> ByteArray(0)
            }
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, responseData)
        }
    }

    @SuppressLint("MissingPermission")
    fun startServer(): Boolean {
        try {
            gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
            if (gattServer == null) {
                Log.e(tag, "Unable to open BluetoothGattServer")
                return false
            }

            val service = BluetoothGattService(
                BleConstants.SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY
            )

            // Write Characteristic (Receive chunks)
            val charWrite = BluetoothGattCharacteristic(
                BleConstants.CHAR_MESSAGE_WRITE,
                BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )
            service.addCharacteristic(charWrite)

            // Message IDs Characteristic (Deduplication exchange)
            val charIds = BluetoothGattCharacteristic(
                BleConstants.CHAR_MESSAGE_IDS,
                BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
            )
            service.addCharacteristic(charIds)

            // Handshake Characteristic
            val charHandshake = BluetoothGattCharacteristic(
                BleConstants.CHAR_HANDSHAKE,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            service.addCharacteristic(charHandshake)

            gattServer?.addService(service)
            Log.i(tag, "GattServer successfully initialized with BartaSetu services")
            return true
        } catch (e: Exception) {
            Log.e(tag, "Exception starting GattServer: ${e.message}")
            return false
        }
    }

    @SuppressLint("MissingPermission")
    fun stopServer() {
        try {
            gattServer?.clearServices()
            gattServer?.close()
            gattServer = null
            Log.i(tag, "GattServer stopped")
        } catch (e: Exception) {
            Log.e(tag, "Exception closing GattServer: ${e.message}")
        }
    }
}
