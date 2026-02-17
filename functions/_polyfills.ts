// Polyfill Buffer for Edge/Deno runtime
import { Buffer } from "npm:buffer";

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
  console.log('[POLYFILL] Buffer added to globalThis');
} else {
  console.log('[POLYFILL] Buffer already defined');
}