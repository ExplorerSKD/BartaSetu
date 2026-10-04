package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.*
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log

class BleScanner(
    private val bluetoothAdapter: BluetoothAdapter,
    private val onDeviceDiscovered: (device: BluetoothDevice, rssi: Int, scanRecord: ScanRecord?) -> Unit
) {
    private val tag = "BartaSetu.BleScanner"
    private var scanner: BluetoothLeScanner? = null
    private var isScanning = false
    private val handler = Handler(Looper.getMainLooper())

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let {
                onDeviceDiscovered(it.device, it.rssi, it.scanRecord)
            }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            results?.forEach {
                onDeviceDiscovered(it.device, it.rssi, it.scanRecord)
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(tag, "BLE Scan failed with error code: $errorCode")
        }
    }

    @SuppressLint("MissingPermission")
    fun startScanning() {
        if (isScanning) return
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
            Log.i(tag, "BLE Scanning started for Service: ${BleConstants.SERVICE_UUID}")

            // Schedule periodic pause to save battery
            handler.postDelayed({
                stopScanning()
                handler.postDelayed({ startScanning() }, BleConstants.SCAN_INTERVAL_MS)
            }, BleConstants.SCAN_PERIOD_MS)
        } catch (e: Exception) {
            Log.e(tag, "Error starting BLE scan: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScanning() {
        if (!isScanning) return
        try {
            scanner?.stopScan(scanCallback)
            isScanning = false
            Log.i(tag, "BLE Scanning stopped")
        } catch (e: Exception) {
            Log.e(tag, "Error stopping BLE scan: ${e.message}")
        }
    }
}
