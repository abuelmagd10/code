/**
 * v3.74.809 — Stamp the Service Worker version at BUILD time.
 *
 * Why this exists: sw.js used `Date.now()` at evaluation time, so its
 * bytes never changed between deployments and browsers never detected
 * an update — open tabs stayed on old bundles until a manual refresh
 * (seen live: the warehouse manager ran build N-2 while production was
 * on N, which also masked the realtime-notifications fix).
 *
 * Runs as part of `npm run build` (see package.json). Replaces:
 *   __SW_BUILD_TS__    -> ms timestamp of this build
 *   __SW_BUILD_DATE__  -> YYYY-MM-DD of this build
 * Idempotent: also matches previously-stamped values, so repeated local
 * builds keep working (on Vercel each build starts from a clean checkout).
 */
const fs = require('fs')
const path = require('path')

const swPath = path.join(__dirname, '..', 'public', 'sw.js')
const src = fs.readFileSync(swPath, 'utf8')

const ts = Date.now().toString()
const date = new Date().toISOString().split('T')[0]

const stamped = src
  // placeholder OR a previous 13-digit stamp
  .replace(/__SW_BUILD_TS__|(?<=const VERSION = '4\.4\.0-)\d{13}(?=')/g, ts)
  .replace(/__SW_BUILD_DATE__|(?<=const BUILD_DATE = ')\d{4}-\d{2}-\d{2}(?=')/g, date)

if (!stamped.includes(ts)) {
  console.error('[stamp-sw-version] FAILED: could not stamp public/sw.js — pattern not found')
  process.exit(1)
}

fs.writeFileSync(swPath, stamped)
console.log(`[stamp-sw-version] sw.js stamped: 4.4.0-${ts} (${date})`)
