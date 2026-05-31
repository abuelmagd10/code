/**
 * Next.js instrumentation hook — runs once per server runtime at boot.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use it to register the Sentry SDK for the matching runtime.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}
