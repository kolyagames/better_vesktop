/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Talks to the Kotlin side (BdBridge.kt) over WebView's JavascriptInterface.
 *
 * The interface object is visible to every frame of the WebView, including third-party iframes, so it is useless
 * without the per-launch token. The token only exists in the script tag the app itself puts into discord.com's
 * main document; nothing else can read it. Every call also has to come while discord.com is the top page.
 *
 * Calls are synchronous like ipcRenderer.sendSync on desktop, which is what BetterDiscord's filesystem API needs.
 * Everything that waits on the network or the user goes through callAsync and settles later.
 */

export interface NativeError {
    message: string;
    code?: string;
}

export type NativeResult<T = unknown> = { ok: true; value: T } | { ok: false; error: NativeError };

interface AndroidBridge {
    call(token: string, op: string, args: string): string;
    callAsync(token: string, id: number, op: string, args: string): void;
    cancel(token: string, id: number): void;
}

// ---------------------------------------------------------------------------------------------------------------
// bytes <-> JSON. JavascriptInterface only carries strings, so binary data travels as {"$b": base64}.
// ---------------------------------------------------------------------------------------------------------------

const B64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += B64_CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + B64_CHUNK) as unknown as number[]);
    }
    return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export function encode(value: unknown): string {
    return JSON.stringify(value, (_key, v) => {
        if (v instanceof Uint8Array) return { $b: bytesToBase64(v) };
        if (v instanceof ArrayBuffer) return { $b: bytesToBase64(new Uint8Array(v)) };
        return v;
    });
}

export function decode<T = unknown>(json: string): T {
    return JSON.parse(json, (_key, v) => (v && typeof v === "object" && typeof v.$b === "string" ? base64ToBytes(v.$b) : v));
}

// ---------------------------------------------------------------------------------------------------------------

export class Native {
    private nextId = 1;
    private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
    private listeners = new Map<string, Set<(payload: any) => void>>();

    constructor(
        private readonly bridge: AndroidBridge,
        private readonly token: string
    ) {}

    static toError(error: NativeError | undefined): Error {
        const err: any = new Error(error?.message ?? "Unknown error");
        if (error?.code) err.code = error.code;
        return err;
    }

    /** Synchronous call. Throws the native error. */
    call<T = unknown>(op: string, ...args: unknown[]): T {
        const result = decode<NativeResult<T>>(this.bridge.call(this.token, op, encode(args)));
        if (!result?.ok) throw Native.toError((result as any)?.error);
        return result.value;
    }

    /** Same as call, but returns the result object instead of throwing. */
    tryCall<T = unknown>(op: string, ...args: unknown[]): NativeResult<T> {
        try {
            return decode<NativeResult<T>>(this.bridge.call(this.token, op, encode(args)));
        } catch (e: any) {
            return { ok: false, error: { message: String(e?.message ?? e) } };
        }
    }

    /** Asynchronous call; `onId` gets the id so the caller can cancel it. */
    callAsync<T = unknown>(op: string, args: unknown[], onId?: (id: number) => void): Promise<T> {
        const id = this.nextId++;
        onId?.(id);
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
            try {
                this.bridge.callAsync(this.token, id, op, encode(args));
            } catch (e: any) {
                this.pending.delete(id);
                reject(new Error(String(e?.message ?? e)));
            }
        });
    }

    cancel(id: number) {
        try {
            this.bridge.cancel(this.token, id);
        } catch {}
    }

    on(event: string, listener: (payload: any) => void) {
        (this.listeners.get(event) ?? this.listeners.set(event, new Set()).get(event)!).add(listener);
        return () => void this.listeners.get(event)?.delete(listener);
    }

    /** Called by the app through evaluateJavascript. */
    settle(id: number, json: string) {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        try {
            const result = decode<NativeResult>(json);
            if (result?.ok) entry.resolve(result.value);
            else entry.reject(Native.toError((result as any)?.error));
        } catch (e: any) {
            entry.reject(new Error(String(e?.message ?? e)));
        }
    }

    /** Called by the app through evaluateJavascript. */
    emit(event: string, json: string) {
        let payload: unknown;
        try {
            payload = decode(json);
        } catch {
            return;
        }
        for (const listener of this.listeners.get(event) ?? []) {
            try {
                listener(payload);
            } catch (e) {
                console.error("[Better Vesktop] event listener failed", e);
            }
        }
    }
}
