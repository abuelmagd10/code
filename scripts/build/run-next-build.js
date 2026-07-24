const { spawn } = require("child_process")

// v3.74.809 — stamp the Service Worker version BEFORE the Next build so
// every deployment changes sw.js bytes and browsers detect the update.
// (The old runtime Date.now() left sw.js byte-identical across deploys,
// so open tabs never auto-reloaded onto new bundles.)
require("../stamp-sw-version.js")

const nextBin = require.resolve("next/dist/bin/next")
const requiredHeapFlag = "--max-old-space-size=8192"
const existingNodeOptions = process.env.NODE_OPTIONS || ""
const nodeOptions = existingNodeOptions.includes("--max-old-space-size")
  ? existingNodeOptions
  : `${requiredHeapFlag} ${existingNodeOptions}`.trim()

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
})

child.on("error", (error) => {
  console.error("Failed to start next build:", error)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
