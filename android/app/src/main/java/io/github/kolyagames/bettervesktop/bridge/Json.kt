/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop.bridge

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject

/*
 * The JSON side of the protocol in src/android/native.ts. JavascriptInterface only carries strings, so binary data
 * travels as {"$b": "<base64>"} in both directions.
 */

object Json {
    /** JS value -> Kotlin: String, Boolean, Number, ByteArray, Map, List or null. */
    fun fromJson(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> {
            val b = value.opt("\$b")
            if (b is String && value.length() == 1) Base64.decode(b, Base64.NO_WRAP)
            else value.keys().asSequence().associateWith { fromJson(value.opt(it)) }
        }
        is JSONArray -> (0 until value.length()).map { fromJson(value.opt(it)) }
        else -> value
    }

    fun parseArgs(json: String?): List<Any?> =
        if (json.isNullOrEmpty()) emptyList() else (fromJson(JSONArray(json)) as? List<Any?>) ?: emptyList()

    /** Kotlin -> JSON value. */
    fun toJson(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is ByteArray -> JSONObject().put("\$b", Base64.encodeToString(value, Base64.NO_WRAP))
        is Map<*, *> -> JSONObject().also { obj -> value.forEach { (k, v) -> obj.put(k.toString(), toJson(v)) } }
        is Iterable<*> -> JSONArray().also { arr -> value.forEach { arr.put(toJson(it)) } }
        is Array<*> -> JSONArray().also { arr -> value.forEach { arr.put(toJson(it)) } }
        is Boolean, is Int, is Long, is Double, is String -> value
        is Float -> value.toDouble()
        is Number -> value.toDouble()
        else -> value.toString()
    }

    fun ok(value: Any?): String = JSONObject().put("ok", true).put("value", toJson(value)).toString()

    fun error(message: String, code: String? = null): String {
        val err = JSONObject().put("message", message)
        if (code != null) err.put("code", code)
        return JSONObject().put("ok", false).put("error", err).toString()
    }

    /** A JSON string as a JavaScript string literal, for evaluateJavascript. */
    fun jsString(s: String): String = JSONObject.quote(s)
}

/** Error with a Node style code, so BetterDiscord's `err.code === "ENOENT"` checks keep working. */
class BdError(message: String, val code: String = "EACCES") : Exception(message)

fun Any?.asStr(): String? = this as? String
fun Any?.asBool(): Boolean = this == true
fun Any?.asInt(): Int? = (this as? Number)?.toInt()
fun Any?.asMap(): Map<String, Any?> = (this as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
