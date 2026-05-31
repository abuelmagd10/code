/**
 * Next.js client-side instrumentation. Runs once when the app boots in the
 * browser. We use it to register Sentry — equivalent to what
 * sentry.client.config.ts used to do via the old auto-config.
 */
import "./sentry.client.config"
