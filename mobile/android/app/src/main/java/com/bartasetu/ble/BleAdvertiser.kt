package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid

@SuppressLint("MissingPermission")
class BleAdvertiser(
    private val context: Context,
    private val bluetoothAdapter: BluetoothAdapter
) {
    private val advertiser: BluetoothLeAdvertiser? by lazy { bluetoothAdapter.bluetoothLeAdvertiser }
    private var isAdvertising = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            isAdvertising = true
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
        }
    }

    fun startAdvertising(deviceName: String, hasInternet: Boolean, batteryLevel: Int) {
        if (isAdvertising || advertiser == null) return

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
            // Example of encoding metadata in service data
            .addServiceData(ParcelUuid(BleConstants.SERVICE_UUID), byteArrayOf(
                (if (hasInternet) 1 else 0).toByte(),
                batteryLevel.toByte()
            ))
            .build()

        try {
            advertiser?.startAdvertising(settings, data, advertiseCallback)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun stopAdvertising() {
        if (!isAdvertising || advertiser == null) return
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
