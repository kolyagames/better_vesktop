/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop.bridge

import android.os.FileObserver
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.AccessDeniedException
import java.nio.file.DirectoryNotEmptyException
import java.nio.file.FileAlreadyExistsException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.NotDirectoryException
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.BasicFileAttributes
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** BetterDiscord's filesystem, the counterpart of src/main/betterdiscord/fs.ts. Every path goes through BdPolicy. */
class BdFs(private val policy: BdPolicy, private val emit: (event: String, payload: Any?) -> Unit) {

    companion object {
        /** Bigger files are not something a plugin or theme needs, and they have to cross the bridge as base64. */
        const val MAX_READ_BYTES = 64L * 1024 * 1024
        private val WRITE_FLAGS = setOf("w", "a", "wx", "ax")
    }

    fun run(op: String, args: List<Any?>): Any? = translate {
        when (op) {
            "readdir" -> {
                val dir = policy.resolveAllowed(args.getOrNull(0))
                val names = dir.list() ?: throw notFoundOrNotDir(dir)
                names.sort()
                if (!args.getOrNull(1).asMap()["withFileTypes"].asBool()) names.toList()
                else names.map { name ->
                    val path = File(dir, name).toPath()
                    mapOf(
                        "name" to name,
                        "isFile" to Files.isRegularFile(path),
                        "isDirectory" to Files.isDirectory(path),
                        "isSymbolicLink" to Files.isSymbolicLink(path)
                    )
                }
            }

            "mkdir" -> {
                val dir = policy.resolveAllowed(args.getOrNull(0))
                if (args.getOrNull(1).asMap()["recursive"].asBool()) Files.createDirectories(dir.toPath())
                else Files.createDirectory(dir.toPath())
                null
            }

            "rmdir" -> {
                val dir = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                if (!Files.isDirectory(dir.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) throw NotDirectoryException(dir.path)
                Files.delete(dir.toPath())
                null
            }

            "exists" -> try {
                policy.resolveAllowed(args.getOrNull(0)).exists()
            } catch (_: BdError) {
                false
            }

            "realpath" -> {
                val file = policy.resolveAllowed(args.getOrNull(0))
                if (!file.exists()) throw NoSuchFileException(file.path)
                file.path
            }

            "rename" -> {
                val from = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                val to = policy.resolveAllowed(args.getOrNull(1), notRoot = true)
                Files.move(from.toPath(), to.toPath(), StandardCopyOption.REPLACE_EXISTING)
                null
            }

            "rm" -> {
                val target = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                val opts = args.getOrNull(1).asMap()
                val path = target.toPath()
                if (!Files.exists(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    if (!opts["force"].asBool()) throw NoSuchFileException(target.path)
                } else if (Files.isDirectory(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                    if (!opts["recursive"].asBool()) throw BdError("Path is a directory: rm returned EISDIR (is a directory) ${target.path}", "ERR_FS_EISDIR")
                    deleteTree(path)
                } else {
                    Files.delete(path)
                }
                null
            }

            "unlink" -> {
                val file = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                if (Files.isDirectory(file.toPath(), java.nio.file.LinkOption.NOFOLLOW_LINKS)) throw BdError("EISDIR: illegal operation on a directory, unlink '${file.path}'", "EISDIR")
                Files.delete(file.toPath())
                null
            }

            "readFile" -> {
                val file = policy.resolveAllowed(args.getOrNull(0))
                val arg = args.getOrNull(1)
                val encoding = arg as? String ?: arg.asMap()["encoding"].asStr()
                if (file.isDirectory) throw BdError("EISDIR: illegal operation on a directory, read", "EISDIR")
                if (!file.exists()) throw NoSuchFileException(file.path)
                if (file.length() > MAX_READ_BYTES) throw BdError("File is too large", "EFBIG")
                val bytes = file.readBytes()
                if (encoding == null) bytes else decodeText(bytes, encoding)
            }

            "writeFile" -> {
                val file = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                val data = args.getOrNull(1)
                val rawOpts = args.getOrNull(2)
                val opts = if (rawOpts is String) mapOf("encoding" to rawOpts) else rawOpts.asMap()
                val flag = opts["flag"].asStr()?.takeIf { it in WRITE_FLAGS } ?: "w"
                val bytes = when (data) {
                    is ByteArray -> data
                    is String -> encodeText(data, opts["encoding"].asStr())
                    else -> throw BdError("Invalid data", "EINVAL")
                }
                if (flag.endsWith("x") && file.exists()) throw FileAlreadyExistsException(file.path)
                if (file.parentFile?.isDirectory != true) throw NoSuchFileException(file.path)
                FileOutputStream(file, flag.startsWith("a")).use { it.write(bytes) }
                null
            }

            "stat" -> {
                val file = policy.resolveAllowed(args.getOrNull(0))
                val s = Os.stat(file.path)
                val l = Os.lstat(file.path)
                val mtime = s.st_mtim.tv_sec * 1000.0 + s.st_mtim.tv_nsec / 1_000_000.0
                val atime = s.st_atim.tv_sec * 1000.0 + s.st_atim.tv_nsec / 1_000_000.0
                val ctime = s.st_ctim.tv_sec * 1000.0 + s.st_ctim.tv_nsec / 1_000_000.0
                mapOf(
                    "size" to s.st_size,
                    "mode" to s.st_mode,
                    "mtimeMs" to mtime,
                    "atimeMs" to atime,
                    "ctimeMs" to ctime,
                    // Linux does not keep a birth time Android exposes; Node falls back the same way
                    "birthtimeMs" to ctime,
                    "isFile" to OsConstants.S_ISREG(s.st_mode),
                    "isDirectory" to OsConstants.S_ISDIR(s.st_mode),
                    "isSymbolicLink" to OsConstants.S_ISLNK(l.st_mode)
                )
            }

            else -> throw BdError("Unknown filesystem operation $op", "EINVAL")
        }
    }

    // ---- watchers ----------------------------------------------------------------------------------------------

    private val watchers = ConcurrentHashMap<Int, FileObserver>()
    private val nextWatchId = AtomicInteger(1)

    fun watch(path: Any?, @Suppress("UNUSED_PARAMETER") recursive: Boolean): Int = translate {
        val target = policy.resolveAllowed(path)
        if (!target.exists()) throw NoSuchFileException(target.path)
        val id = nextWatchId.getAndIncrement()
        // CLOSE_WRITE rather than MODIFY: a plugin is reloaded once it is fully written, not on every chunk
        val mask = FileObserver.CREATE or FileObserver.DELETE or FileObserver.MOVED_FROM or FileObserver.MOVED_TO or
            FileObserver.CLOSE_WRITE or FileObserver.DELETE_SELF or FileObserver.MOVE_SELF

        // Node reports "rename" for anything that adds or removes a name and "change" for content.
        // The String constructor is deprecated since API 29 but is the only one on Android 9.
        @Suppress("DEPRECATION")
        val observer = object : FileObserver(target.path, mask) {
            override fun onEvent(event: Int, name: String?) {
                val type = when (event and FileObserver.ALL_EVENTS) {
                    FileObserver.CLOSE_WRITE -> "change"
                    0 -> return
                    else -> "rename"
                }
                emit("watch", mapOf("id" to id, "event" to type, "filename" to name))
            }
        }
        observer.startWatching()
        watchers[id] = observer
        id
    }

    fun unwatch(id: Int?) {
        if (id == null) return
        watchers.remove(id)?.stopWatching()
    }

    // ---- write streams -----------------------------------------------------------------------------------------

    private val streams = ConcurrentHashMap<Int, File>()
    private val nextStreamId = AtomicInteger(1)

    fun stream(action: String?, args: List<Any?>): Any? = translate {
        when (action) {
            "open" -> {
                val file = policy.resolveAllowed(args.getOrNull(0), notRoot = true)
                val append = args.getOrNull(1).asStr()?.startsWith("a") == true
                if (file.parentFile?.isDirectory != true) throw NoSuchFileException(file.path)
                FileOutputStream(file, append).close()
                val id = nextStreamId.getAndIncrement()
                streams[id] = file
                id
            }

            "write" -> {
                val file = streams[args.getOrNull(0).asInt()] ?: throw BdError("Stream closed", "EBADF")
                val bytes = when (val chunk = args.getOrNull(1)) {
                    is ByteArray -> chunk
                    is String -> chunk.toByteArray()
                    else -> throw BdError("Invalid data", "EINVAL")
                }
                FileOutputStream(file, true).use { it.write(bytes) }
                null
            }

            "close" -> {
                streams.remove(args.getOrNull(0).asInt())
                null
            }

            else -> throw BdError("Unknown stream action", "EINVAL")
        }
    }

    fun streamPath(id: Int?): String? = id?.let { streams[it]?.path }

    fun closeAll() {
        watchers.values.forEach { it.stopWatching() }
        watchers.clear()
        streams.clear()
    }

    // ---- helpers -----------------------------------------------------------------------------------------------

    private fun deleteTree(root: Path) {
        // walkFileTree does not follow symbolic links, so a link inside the folder can never lead outside it
        Files.walkFileTree(root, object : SimpleFileVisitor<Path>() {
            override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                Files.delete(file)
                return FileVisitResult.CONTINUE
            }

            override fun postVisitDirectory(dir: Path, exc: IOException?): FileVisitResult {
                if (exc != null) throw exc
                Files.delete(dir)
                return FileVisitResult.CONTINUE
            }
        })
    }

    private fun notFoundOrNotDir(file: File): Exception =
        if (file.exists()) NotDirectoryException(file.path) else NoSuchFileException(file.path)

    private fun charsetFor(encoding: String?) = when (encoding?.lowercase()) {
        "latin1", "binary" -> Charsets.ISO_8859_1
        "ascii" -> Charsets.US_ASCII
        "utf16le", "utf-16le", "ucs2", "ucs-2" -> Charsets.UTF_16LE
        else -> Charsets.UTF_8
    }

    private fun decodeText(bytes: ByteArray, encoding: String): String = when (encoding.lowercase()) {
        "base64" -> android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        "hex" -> bytes.joinToString("") { "%02x".format(it) }
        else -> String(bytes, charsetFor(encoding))
    }

    private fun encodeText(text: String, encoding: String?): ByteArray = when (encoding?.lowercase()) {
        "base64" -> android.util.Base64.decode(text, android.util.Base64.DEFAULT)
        else -> text.toByteArray(charsetFor(encoding))
    }

    /** Java and errno exceptions -> errors with Node codes. */
    private inline fun <T> translate(block: () -> T): T = try {
        block()
    } catch (e: BdError) {
        throw e
    } catch (e: NoSuchFileException) {
        throw BdError("ENOENT: no such file or directory, '${e.file}'", "ENOENT")
    } catch (e: FileAlreadyExistsException) {
        throw BdError("EEXIST: file already exists, '${e.file}'", "EEXIST")
    } catch (e: DirectoryNotEmptyException) {
        throw BdError("ENOTEMPTY: directory not empty, '${e.file}'", "ENOTEMPTY")
    } catch (e: NotDirectoryException) {
        throw BdError("ENOTDIR: not a directory, '${e.file}'", "ENOTDIR")
    } catch (e: AccessDeniedException) {
        throw BdError("EACCES: permission denied, '${e.file}'", "EACCES")
    } catch (e: ErrnoException) {
        val code = OsConstants.errnoName(e.errno) ?: "EIO"
        throw BdError("$code: ${e.message}", code)
    } catch (e: IOException) {
        throw BdError(e.message ?: "I/O error", "EIO")
    }
}
