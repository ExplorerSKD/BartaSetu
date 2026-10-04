package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.*
import android.os.ParcelUuid
import android.util.Log
import com.bartasetu.mesh.PeerInfo

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

    /**
     * A legacy advertisement is limited to 31 bytes, so the 128-bit service UUID goes in the
     * advertisement and the service data (internet flag, battery, BartaSetu ID) in the scan response.
     */
    @SuppressLint("MissingPermission")
    fun startAdvertising(info: PeerInfo) {
        if (isAdvertising) stopAdvertising()
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

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
            .build()

        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceData(ParcelUuid(BleConstants.SERVICE_UUID), encodeServiceData(info))
            .build()

        try {
            advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
        } catch (e: Exception) {
            Log.e(tag, "Exception starting advertising: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (e: Exception) {
            Log.e(tag, "Exception stopping advertising: ${e.message}")
        }
        isAdvertising = false
    }

    companion object {
        fun encodeServiceData(info: PeerInfo): ByteArray {
            val idBody = info.bsId.removePrefix("BS-").padEnd(6, '?').take(6)
            val bytes = ByteArray(BleConstants.SERVICE_DATA_LENGTH)
            bytes[0] = (if (info.hasInternet) BleConstants.FLAG_HAS_INTERNET else 0).toByte()
            bytes[1] = info.battery.coerceIn(0, 100).toByte()
            idBody.toByteArray(Charsets.US_ASCII).copyInto(bytes, 2)
            return bytes
        }

        fun decodeServiceData(bytes: ByteArray?): PeerInfo? {
            if (bytes == null || bytes.size < BleConstants.SERVICE_DATA_LENGTH) return null
            val idBody = String(bytes, 2, 6, Charsets.US_ASCII)
            if (idBody.contains('?')) return null
            return PeerInfo(
                bsId = "BS-$idBody",
                hasInternet = (bytes[0].toInt() and BleConstants.FLAG_HAS_INTERNET) != 0,
                battery = bytes[1].toInt().coerceIn(0, 100),
            )
        }
    }
}
