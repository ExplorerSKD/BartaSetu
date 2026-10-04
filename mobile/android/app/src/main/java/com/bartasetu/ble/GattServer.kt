package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.content.Context
import android.util.Log

@SuppressLint("MissingPermission")
class GattServer(
    private val context: Context,
    private val bluetoothManager: BluetoothManager,
    private val onMessageReceived: (String, String) -> Unit
) {
    private var gattServer: BluetoothGattServer? = null
    
    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                // Handle client connected
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                // Handle client disconnected
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
            
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            }
            
            if (value != null && characteristic.uuid == BleConstants.CHAR_MESSAGE_WRITE) {
                val transferId = "${device.address}_${characteristic.uuid}"
                val reassembled = BleDataProtocol.reassembleChunk(value, transferId)
                if (reassembled != null) {
                    val message = String(reassembled, Charsets.UTF_8)
                    onMessageReceived(message, device.address)
                }
            }
        }
    }

    fun startServer() {
        if (gattServer != null) return
        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
        
        val service = BluetoothGattService(BleConstants.SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        
        val charWrite = BluetoothGattCharacteristic(
            BleConstants.CHAR_MESSAGE_WRITE,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        val charIds = BluetoothGattCharacteristic(
            BleConstants.CHAR_MESSAGE_IDS,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        val charInfo = BluetoothGattCharacteristic(
            BleConstants.CHAR_DEVICE_INFO,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )

        val charHandshake = BluetoothGattCharacteristic(
            BleConstants.CHAR_HANDSHAKE,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
        )
        
        service.addCharacteristic(charWrite)
        service.addCharacteristic(charIds)
        service.addCharacteristic(charInfo)
        service.addCharacteristic(charHandshake)
        
        gattServer?.addService(service)
    }

    fun stopServer() {
        gattServer?.close()
        gattServer = null
    }
}
