// CRITICAL: Import Node globals FIRST to ensure Buffer exists before npm packages load
import "https://deno.land/std@0.224.0/node/global.ts";

// Wrapper that dynamically loads implementation AFTER globals are set
Deno.serve(async (req: Request) => {
  const impl = await import("./getArchiveEntriesBatch_impl.ts");
  return impl.default(req);
});