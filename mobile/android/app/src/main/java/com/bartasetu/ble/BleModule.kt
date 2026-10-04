package com.bartasetu.ble

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.bartasetu.service.BleForegroundService
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class BleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val messageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == "com.bartasetu.ble.MESSAGE_RECEIVED") {
                val message = intent.getStringExtra("message")
                val sender = intent.getStringExtra("sender")
                val params = Arguments.createMap().apply {
                    putString("message", message)
                    putString("sender", sender)
                }
                sendEvent("onMessageReceived", params)
            }
        }
    }

    init {
        val filter = IntentFilter("com.bartasetu.ble.MESSAGE_RECEIVED")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(messageReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(messageReceiver, filter)
        }
    }

    override fun getName(): String = "BleModule"

    @ReactMethod
    fun startMeshService(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, BleForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopMeshService(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, BleForegroundService::class.java)
            context.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getNearbyDevices(promise: Promise) {
        // Mock implementation for JS call mapping
        val array = Arguments.createArray()
        promise.resolve(array)
    }

    @ReactMethod
    fun sendMessageToMesh(messageJson: String, promise: Promise) {
        try {
            // Note: In a real implementation we would route this to BleConnectionManager
            // For now, we can broadcast an intent that the service picks up
            val intent = Intent("com.bartasetu.ble.SEND_MESSAGE")
            intent.putExtra("message", messageJson)
            reactApplicationContext.sendBroadcast(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SEND_MESSAGE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getServiceStatus(promise: Promise) {
        promise.resolve(true)
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
