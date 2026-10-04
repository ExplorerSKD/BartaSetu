package com.bartasetu.ble

import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.ceil

object BleDataProtocol {
    const val FLAG_START = 0x01.toByte()
    const val FLAG_CONTINUATION = 0x02.toByte()
    const val FLAG_END = 0x04.toByte()
    const val FLAG_HANDSHAKE = 0x08.toByte()
    const val FLAG_ID_EXCHANGE = 0x10.toByte()

    private val assemblyBuffers = ConcurrentHashMap<String, AssemblyBuffer>()

    class AssemblyBuffer(val expectedChunks: Short, val transferId: String, val timestamp: Long = System.currentTimeMillis()) {
        val chunks = mutableMapOf<Short, ByteArray>()
        
        fun isComplete(): Boolean = chunks.size == expectedChunks.toInt()
        
        fun assemble(): ByteArray {
            var totalSize = 0
            for (i in 0 until expectedChunks) {
                totalSize += chunks[i.toShort()]?.size ?: 0
            }
            val bb = ByteBuffer.allocate(totalSize)
            for (i in 0 until expectedChunks) {
                chunks[i.toShort()]?.let { bb.put(it) }
            }
            return bb.array()
        }
    }

    fun chunkPayload(data: ByteArray, mtu: Int): List<ByteArray> {
        val headerSize = 5
        val maxPayloadPerChunk = (mtu - 3) - headerSize
        val numChunks = ceil(data.size.toDouble() / maxPayloadPerChunk).toInt().toShort()
        val result = mutableListOf<ByteArray>()

        for (i in 0 until numChunks) {
            val startIdx = i * maxPayloadPerChunk
            val endIdx = Math.min(startIdx + maxPayloadPerChunk, data.size)
            val chunkPayload = data.copyOfRange(startIdx, endIdx)
            
            val flag = when {
                numChunks == 1.toShort() -> FLAG_START.toInt() or FLAG_END.toInt()
                i == 0 -> FLAG_START.toInt()
                i == numChunks.toInt() - 1 -> FLAG_END.toInt()
                else -> FLAG_CONTINUATION.toInt()
            }
            
            val bb = ByteBuffer.allocate(headerSize + chunkPayload.size)
            bb.put(flag.toByte())
            bb.putShort(i.toShort())
            bb.putShort(numChunks)
            bb.put(chunkPayload)
            
            result.add(bb.array())
        }
        return result
    }

    fun reassembleChunk(chunk: ByteArray, transferId: String): ByteArray? {
        if (chunk.size < 5) return null
        val bb = ByteBuffer.wrap(chunk)
        val flag = bb.get()
        val seq = bb.getShort()
        val totalChunks = bb.getShort()
        val payload = ByteArray(bb.remaining())
        bb.get(payload)

        cleanupOldBuffers()
        
        var buffer = assemblyBuffers[transferId]
        if (buffer == null) {
            if ((flag.toInt() and FLAG_START.toInt()) == 0) return null 
            buffer = AssemblyBuffer(totalChunks, transferId)
            assemblyBuffers[transferId] = buffer
        }

        buffer.chunks[seq] = payload

        if (buffer.isComplete()) {
            assemblyBuffers.remove(transferId)
            return buffer.assemble()
        }
        return null
    }

    private fun cleanupOldBuffers() {
        val now = System.currentTimeMillis()
        val iterator = assemblyBuffers.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (now - entry.value.timestamp > 60_000) {
                iterator.remove()
            }
        }
    }
}
