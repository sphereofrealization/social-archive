
// Polyfill Buffer for Edge/Deno runtime
import { Buffer } from "node:buffer";

globalThis.Buffer ??= Buffer;
console.log('[POLYFILL] Buffer polyfill applied, type:', typeof globalThis.Buffer);
