package com.bartasetu.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.util.concurrent.ConcurrentHashMap

@SuppressLint("MissingPermission")
class BleScanner(
    private val context: Context,
    private val bluetoothAdapter: BluetoothAdapter,
    private val onDeviceDiscovered: (BluetoothDevice, Int, ScanRecord?) -> Unit
) {
    private val scanner: BluetoothLeScanner? by lazy { bluetoothAdapter.bluetoothLeScanner }
    private val handler = Handler(Looper.getMainLooper())
    private var isScanning = false
    
    private val discoveredDevices = ConcurrentHashMap<String, Long>()

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val now = System.currentTimeMillis()
            discoveredDevices[device.address] = now
            onDeviceDiscovered(device, result.rssi, result.scanRecord)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            for (result in results) {
                onScanResult(ScanSettings.CALLBACK_TYPE_ALL_MATCHES, result)
            }
        }

        override fun onScanFailed(errorCode: Int) {
            // Handle scan failure
        }
    }

    fun startScanning() {
        if (isScanning || scanner == null) return
        
        val filters = listOf(
            ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
                .build()
        )
        
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
            
        try {
            scanner?.startScan(filters, settings, scanCallback)
            isScanning = true
            
            // Schedule stop
            handler.postDelayed({
                stopScanning()
                // Schedule restart
                handler.postDelayed({
                    startScanning()
                }, BleConstants.SCAN_INTERVAL_MS)
            }, BleConstants.SCAN_PERIOD_MS)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun stopScanning() {
        if (!isScanning || scanner == null) return
        try {
            scanner?.stopScan(scanCallback)
            isScanning = false
            handler.removeCallbacksAndMessages(null)
            cleanupOldDevices()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    private fun cleanupOldDevices() {
        val now = System.currentTimeMillis()
        val iterator = discoveredDevices.entries.iterator()
        while(iterator.hasNext()) {
            val entry = iterator.next()
            if (now - entry.value > 60_000) {
                iterator.remove()
            }
        }
    }
}
