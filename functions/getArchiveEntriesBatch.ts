
// CRITICAL: Import Node globals FIRST to ensure Buffer exists before npm packages load
import "https://deno.land/std@0.224.0/node/global.ts";

// Dynamic import AFTER globals are set up
const impl = await import("./getArchiveEntriesBatch_impl.ts");

Deno.serve(impl.default);
