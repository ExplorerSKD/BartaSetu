package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.*
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import com.bartasetu.mesh.PeerInfo

class BleScanner(
    private val bluetoothAdapter: BluetoothAdapter,
    private val onDeviceDiscovered: (device: BluetoothDevice, rssi: Int, info: PeerInfo?) -> Unit
) {
    private val tag = "BartaSetu.BleScanner"
    private var scanner: BluetoothLeScanner? = null
    private var isScanning = false
    private var enabled = false
    private val handler = Handler(Looper.getMainLooper())

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let { report(it) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            results?.forEach { report(it) }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(tag, "BLE Scan failed with error code: $errorCode")
        }
    }

    private fun report(result: ScanResult) {
        val serviceData = result.scanRecord?.getServiceData(ParcelUuid(BleConstants.SERVICE_UUID))
        onDeviceDiscovered(result.device, result.rssi, BleAdvertiser.decodeServiceData(serviceData))
    }

    /** Duty-cycled scanning (scan 10 s, pause 5 s) to save battery. */
    fun startScanning() {
        enabled = true
        scanOnce()
    }

    @SuppressLint("MissingPermission")
    private fun scanOnce() {
        if (!enabled || isScanning) return
        scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            Log.w(tag, "BluetoothLeScanner not available")
            return
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build()

        try {
            scanner?.startScan(listOf(filter), settings, scanCallback)
            isScanning = true
            handler.postDelayed({
                pause()
                handler.postDelayed({ scanOnce() }, BleConstants.SCAN_INTERVAL_MS)
            }, BleConstants.SCAN_PERIOD_MS)
        } catch (e: Exception) {
            Log.e(tag, "Error starting BLE scan: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    private fun pause() {
        if (!isScanning) return
        try {
            scanner?.stopScan(scanCallback)
        } catch (e: Exception) {
            Log.e(tag, "Error stopping BLE scan: ${e.message}")
        }
        isScanning = false
    }

    fun stopScanning() {
        enabled = false
        handler.removeCallbacksAndMessages(null)
        pause()
    }
}
