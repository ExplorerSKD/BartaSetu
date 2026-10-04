package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.*
import android.os.ParcelUuid
import android.util.Log

class BleAdvertiser(
    private val bluetoothAdapter: BluetoothAdapter
) {
    private val tag = "BartaSetu.BleAdvertiser"
    private var advertiser: BluetoothLeAdvertiser? = null
    private var isAdvertising = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
            Log.i(tag, "BLE Advertising started successfully")
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            Log.e(tag, "BLE Advertising failed with code: $errorCode")
        }
    }

    @SuppressLint("MissingPermission")
    fun startAdvertising(hasInternet: Boolean = false, batteryLevel: Int = 100) {
        if (isAdvertising) return
        advertiser = bluetoothAdapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.w(tag, "BluetoothLeAdvertiser not supported on this device")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0)
            .build()

        // Service Data byte 0: Internet flag, byte 1: Battery level
        val serviceData = byteArrayOf(
            if (hasInternet) 0x01.toByte() else 0x00.toByte(),
            batteryLevel.toByte()
        )

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
            .addServiceData(ParcelUuid(BleConstants.SERVICE_UUID), serviceData)
            .build()

        try {
            advertiser?.startAdvertising(settings, data, advertiseCallback)
        } catch (e: Exception) {
            Log.e(tag, "Exception starting advertising: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun stopAdvertising() {
        if (!isAdvertising) return
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
            Log.i(tag, "BLE Advertising stopped")
        } catch (e: Exception) {
            Log.e(tag, "Exception stopping advertising: ${e.message}")
        }
    }
}
