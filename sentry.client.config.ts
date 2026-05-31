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
    "The user aborted a request",
    // Vercel's feedback widget (third-party, not our code)
    "InvalidNodeTypeError: Failed to execute 'selectNode' on 'Range'",
    // Service worker noise
    "The operation was aborted",
  ],

  // Drop events that originate from third-party scripts we do not control
  denyUrls: [
    /^https:\/\/vercel\.live\//,
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],

  beforeSend(event) {
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
