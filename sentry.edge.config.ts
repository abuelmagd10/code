import * as Sentry from "@sentry/nextjs"
import { APP_VERSION } from "@/lib/version"

const DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  "https://dd6a41caacb85a1659636020ed677818@o4511483798880256.ingest.us.sentry.io/4511483825356800"

Sentry.init({
  dsn: DSN,
  enabled: !!DSN,
  release: `7esab@${APP_VERSION}`,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
})
