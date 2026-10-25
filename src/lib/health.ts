/**
 * Uptime check: is the database answering? Says only ok or not ok, so an
 * outside monitor learns nothing else about the system. On timeout the query
 * is cancelled through `signal`, so hung checks don't pile up.
 */
export async function checkHealth(ping: (signal: AbortSignal) => PromiseLike<unknown>, timeoutMs = 3000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    await Promise.race([ping(controller.signal), timeout]);
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 503, body: { ok: false } };
  } finally {
    clearTimeout(timer);
  }
}
