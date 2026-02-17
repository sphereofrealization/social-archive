
// Polyfill Buffer for Edge/Deno runtime
// Use Deno std node polyfill which is guaranteed to work in Deno
import { Buffer } from "https://deno.land/std@0.224.0/node/buffer.ts";

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
  console.log('[POLYFILL] Buffer polyfill applied from Deno std');
} else {
  console.log('[POLYFILL] Buffer already exists, type:', typeof globalThis.Buffer);
}
