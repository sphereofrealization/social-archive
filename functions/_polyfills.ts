
// Polyfill Buffer for Edge/Deno runtime
import { Buffer } from "npm:buffer@6.0.3";

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
  console.log('[POLYFILL] Buffer added to globalThis');
} else {
  console.log('[POLYFILL] Buffer already defined');
}
