package com.bartasetu.ble

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap

object BleDataProtocol {
    const val FLAG_START: Byte = 0x01
    const val FLAG_CONTINUATION: Byte = 0x02
    const val FLAG_END: Byte = 0x04
    const val FLAG_HANDSHAKE: Byte = 0x08
    const val FLAG_ID_EXCHANGE: Byte = 0x10

    private const val HEADER_SIZE = 5 // 1 byte flag + 2 bytes seq + 2 bytes total

    private val assemblyBuffers = ConcurrentHashMap<String, ChunkAssembly>()

    data class ChunkAssembly(
        val totalChunks: Int,
        val chunks: MutableMap<Int, ByteArray> = mutableMapOf(),
        val createdAt: Long = System.currentTimeMillis()
    )

    fun chunkPayload(data: ByteArray, mtu: Int): List<ByteArray> {
        val maxPayloadPerChunk = (mtu - 3) - HEADER_SIZE // 3 bytes GATT overhead
        val effectivePayload = if (maxPayloadPerChunk > 10) maxPayloadPerChunk else 15

        val chunks = mutableListOf<ByteArray>()
        val totalChunks = Math.ceil(data.size.toDouble() / effectivePayload).toInt()

        for (i in 0 until totalChunks) {
            val start = i * effectivePayload
            val end = Math.min(start + effectivePayload, data.size)
            val chunkLength = end - start

            val flag = when {
                totalChunks == 1 -> (FLAG_START.toInt() or FLAG_END.toInt()).toByte()
                i == 0 -> FLAG_START
                i == totalChunks - 1 -> FLAG_END
                else -> FLAG_CONTINUATION
            }

            val buffer = ByteBuffer.allocate(HEADER_SIZE + chunkLength)
            buffer.put(flag)
            buffer.putShort(i.toShort())
            buffer.putShort(totalChunks.toShort())
            buffer.put(data, start, chunkLength)

            chunks.add(buffer.array())
        }
        return chunks
    }

    fun reassembleChunk(chunk: ByteArray, transferId: String): ByteArray? {
        if (chunk.size < HEADER_SIZE) return null

        val buffer = ByteBuffer.wrap(chunk)
        val flag = buffer.get()
        val seq = buffer.short.toInt()
        val total = buffer.short.toInt()

        val payload = ByteArray(chunk.size - HEADER_SIZE)
        buffer.get(payload)

        // A new transfer from this peer replaces any half-finished one (e.g. after a dropped link)
        if ((flag.toInt() and FLAG_START.toInt()) != 0) {
            assemblyBuffers.remove(transferId)
        }

        val assembly = assemblyBuffers.computeIfAbsent(transferId) {
            ChunkAssembly(totalChunks = total)
        }

        assembly.chunks[seq] = payload

        if (assembly.chunks.size == assembly.totalChunks) {
            assemblyBuffers.remove(transferId)
            val output = ByteArrayOutputStream()
            for (i in 0 until assembly.totalChunks) {
                val piece = assembly.chunks[i] ?: return null
                output.write(piece)
            }
            return output.toByteArray()
        }

        // Clean stale buffers older than 60 seconds
        val now = System.currentTimeMillis()
        assemblyBuffers.entries.removeIf { now - it.value.createdAt > 60_000 }

        return null
    }
}
