import * as Sentry from "@sentry/nextjs"
import { APP_VERSION } from "@/lib/version"

const DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  "https://dd6a41caacb85a1659636020ed677818@o4511483798880256.ingest.us.sentry.io/4511483825356800"

Sentry.init({
  dsn: DSN,
  enabled: !!DSN,

  // Track which app version produced each error.
  release: `7esab@${APP_VERSION}`,
  environment: process.env.NODE_ENV,

  // Performance
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay — captures user sessions when errors happen
  replaysSessionSampleRate: 0.05, // 5% of normal sessions
  replaysOnErrorSampleRate: 1.0, // 100% of error sessions

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],

  // Filter out noise that does not represent real bugs
  ignoreErrors: [
    // Browser extension noise
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Network blips
    "NetworkError",
    "Failed to fetch",
    "Load failed",
    // AbortController / fetch cancellation — fires when the user navigates
    // away mid-request. Our context providers (PermissionsContext,
    // CurrencySync, useServerPagination) all catch AbortError; the leaks
    // that hit Sentry are downstream promise chains we can't reach.
    "The user aborted a request",
    "signal is aborted without reason",
    "AbortError",
    // Service worker / PWA update glitches — transient browser-level
    // failures fetching sw.js. Not a bug in our code.
    "The operation was aborted",
    "Failed to update a ServiceWorker",
    "An unknown error occurred when fetching the script",
    // Vercel's feedback widget (third-party, not our code)
    "InvalidNodeTypeError: Failed to execute 'selectNode' on 'Range'",
  ],

  // Drop events that originate from third-party scripts we do not control
  denyUrls: [
    /^https:\/\/vercel\.live\//,
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],

  beforeSend(event, hint) {
    // Second-layer noise filter: ignoreErrors works on the message string,
    // but browsers change those wordings between versions. Match by
    // exception type/name as well so we're future-proof.
    const ex = event.exception?.values?.[0]
    const exType = ex?.type || ""
    const exValue = ex?.value || ""
    const orig: any = (hint as any)?.originalException
    const origName = (orig && typeof orig === "object" && "name" in orig) ? String((orig as any).name) : ""

    // AbortError fires whenever the user navigates away mid-request. It's
    // benign — caught by our context providers — but the rejection still
    // bubbles to onunhandledrejection. Drop it.
    if (
      exType === "AbortError" ||
      origName === "AbortError" ||
      /signal is aborted/i.test(exValue) ||
      /aborted without reason/i.test(exValue)
    ) {
      return null
    }

    // Service worker update is browser-managed; transient fetch failures
    // for sw.js are not our bug.
    if (/Failed to update a ServiceWorker/i.test(exValue)) {
      return null
    }

    // Strip sensitive headers / cookies that may have leaked into breadcrumbs
    if (event.request?.cookies) delete event.request.cookies
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, unknown>
      delete h["authorization"]
      delete h["cookie"]
    }
    return event
  },
})
