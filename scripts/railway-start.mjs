import { spawn } from "node:child_process";

const serviceName = process.env.RAILWAY_SERVICE_NAME;
const target =
  serviceName === "coach-web" ? "@coach-ai/web" : "@coach-ai/api";

const child = spawn("pnpm", ["--filter", target, "start"], {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
