package com.aidoraa.app.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.KeyStore
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Cache and preferences in a private SharedPreferences file (not backed up). */
class PrefsKeyValueStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("aidoraa_cache", Context.MODE_PRIVATE)
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
    override fun clear() { prefs.edit().clear().apply() }
}

/**
 * The session, encrypted with an AES-GCM key that never leaves the Android
 * Keystore. If the key is lost (restored device, cleared credentials) the
 * stored value simply fails to decrypt and the person signs in again.
 */
class KeystoreSecureStore(context: Context) : SecureStore {
    private val prefs = context.getSharedPreferences("aidoraa_secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    @Synchronized
    override fun get(key: String): String? {
        val stored = prefs.getString(key, null) ?: return null
        return runCatching {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_SIZE))
            String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
        }.getOrElse {
            prefs.edit().remove(key).apply()
            null
        }
    }

    @Synchronized
    override fun put(key: String, value: String?) {
        if (value == null) { prefs.edit().remove(key).apply(); return }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(key, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    private companion object {
        const val ALIAS = "aidoraa_session_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}

/**
 * The upload for a file import, built the way the website builds it: the text
 * entries of any ZIPs plus loose JSON, text and Markdown files, re-zipped.
 */
object ImportArchive {
    private val TEXT_ENTRY = Regex("""\.(json|txt|md|markdown|html?)$""", RegexOption.IGNORE_CASE)
    private const val MAX_EXPANDED_BYTES = 512L * 1024 * 1024

    fun isRelevantEntry(name: String) =
        TEXT_ENTRY.containsMatchIn(name) && !name.startsWith("__MACOSX/") && name.split('/').none { it.startsWith("._") }

    fun build(files: List<PickedFile>): ByteArray {
        val entries = LinkedHashMap<String, ByteArray>()
        var total = 0L
        files.forEachIndexed { index, file ->
            val isZip = file.name.endsWith(".zip", ignoreCase = true) || file.mimeType == "application/zip"
            if (isZip) {
                val inner = LinkedHashMap<String, ByteArray>()
                ZipInputStream(ByteArrayInputStream(file.bytes)).use { zip ->
                    while (true) {
                        val entry = zip.nextEntry ?: break
                        if (!entry.isDirectory && isRelevantEntry(entry.name)) {
                            val bytes = zip.readBytes()
                            total += bytes.size
                            require(total <= MAX_EXPANDED_BYTES) { "This export is larger than one import can hold. Split it into smaller uploads." }
                            inner[entry.name] = bytes
                        }
                    }
                }
                // HTML renderings duplicate the JSON in the same export.
                if (inner.keys.any { it.endsWith(".json", ignoreCase = true) }) {
                    inner.keys.removeAll { it.endsWith(".html", ignoreCase = true) || it.endsWith(".htm", ignoreCase = true) }
                }
                inner.forEach { (name, bytes) -> entries["$index/$name"] = bytes }
            } else if (Regex("""\.(json|txt|md|markdown)$""", RegexOption.IGNORE_CASE).containsMatchIn(file.name)) {
                entries["$index/${file.name}"] = file.bytes
            } else {
                throw IllegalArgumentException("${file.name} isn't a supported file. Upload the export's .zip, .json, .txt or .md file.")
            }
        }
        require(entries.isNotEmpty()) { "Nothing readable was found. Check that this is the right export." }
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            zip.setLevel(6)
            entries.forEach { (name, bytes) ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
        }
        return out.toByteArray()
    }
}
