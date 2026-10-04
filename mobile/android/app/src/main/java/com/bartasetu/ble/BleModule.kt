package com.bartasetu.ble

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.bartasetu.service.BleForegroundService

class BleModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        instance = this
    }

    override fun getName(): String = "BleModule"

    @ReactMethod
    fun startMeshService(promise: Promise) {
        try {
            val intent = Intent(reactContext, BleForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR_START_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun stopMeshService(promise: Promise) {
        try {
            val intent = Intent(reactContext, BleForegroundService::class.java)
            reactContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR_STOP_SERVICE", e.message)
        }
    }

    @ReactMethod
    fun sendMessageToMesh(messageJson: String, promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun getNearbyDevices(promise: Promise) {
        val array = Arguments.createArray()
        promise.resolve(array)
    }

    @ReactMethod
    fun getServiceStatus(promise: Promise) {
        val map = Arguments.createMap()
        map.putBoolean("isMeshActive", true)
        promise.resolve(map)
    }

    companion object {
        private var instance: BleModule? = null

        fun emitEvent(eventName: String, params: Any?) {
            instance?.reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        }
    }
}
