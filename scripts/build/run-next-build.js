const { spawn } = require("child_process")

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
