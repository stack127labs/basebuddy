import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.argv[2];
if (!image) throw new Error("Usage: node scripts/smoke-docker.mjs <image>");
const prefix = `basebuddy-smoke-${process.pid}-${Date.now()}`;
const folder = await mkdtemp(join(tmpdir(), "basebuddy-docker-"));
await chmod(folder, 0o700);
const token = randomBytes(32).toString("hex");
const password = `Docker-${randomBytes(24).toString("hex")}!`;
const volumes = [`${prefix}-data`, `${prefix}-restore`];
const containers = new Set();
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim();
const check = (condition, message) => { if (!condition) throw new Error(message); };
const envPath = join(folder, "runtime.env");
await writeFile(envPath, [
  `BASEBUDDY_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
  `BASEBUDDY_SETUP_TOKEN=${token}`,
  `BASEBUDDY_CONTENT_DATABASE_URL=${process.env.BASEBUDDY_DOCKER_TEST_DATABASE_URL ?? "postgresql://basebuddy_release_runtime:basebuddy-local-runtime-test@host.docker.internal:5432/basebuddy_test?sslmode=disable"}`,
  "BASEBUDDY_ENABLE_TEST_AUTH=1",
  "BASEBUDDY_PLAYWRIGHT_RUNTIME=1",
  "BASEBUDDY_TEST_BUILD=1",
  "PLAYWRIGHT_BASE_URL=http://localhost:8080",
  "PLAYWRIGHT_OWNER_EMAIL=owner@example.com",
  `PLAYWRIGHT_OWNER_PASSWORD=${password}`,
  "",
].join("\n"), { mode: 0o600 });

const start = async (name, volume) => {
  const network = process.env.BASEBUDDY_DOCKER_TEST_NETWORK;
  docker("run", "--detach", "--name", name, "--add-host", "host.docker.internal:host-gateway", ...(network ? ["--network", network] : []), "--env-file", envPath, "--mount", `type=volume,source=${volume},target=/app/basebuddy-data`, "--publish", "127.0.0.1::8080", image);
  containers.add(name);
  const port = docker("port", name, "8080/tcp").split(":").at(-1);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45000;
  while (true) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error("Container did not become healthy.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check(docker("exec", name, "id", "-u") === "10001", "The app must run as the unprivileged user.");
  return base;
};
const login = async (base) => {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email: "owner@example.com", password }) });
  check(response.ok, "The saved owner must be able to sign in.");
};
try {
  for (const volume of volumes) docker("volume", "create", volume);
  const name = `${prefix}-app`;
  let base = await start(name, volumes[0]);
  check((await fetch(`${base}/onboarding`)).ok, "A fresh install must serve onboarding.");
  check((await fetch(`${base}/api/ready`)).status === 503, "A fresh install must not report ready.");
  const payload = { ownerEmail: "owner@example.com", ownerName: "Docker Owner", ownerPassword: password };
  let response = await fetch(`${base}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  check(response.status === 403, "Public callers must not create the owner without the setup credential.");
  response = await fetch(`${base}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ ...payload, setupToken: token }) });
  check(response.ok, "An authorized setup request must create the owner.");
  await login(base);
  check((await fetch(`${base}/api/test-auth/playwright-sign-in?role=owner`, { redirect: "manual" })).status === 404, "A normal production image must not enable test sign-in even with copied test environment values.");
  docker("exec", name, "pnpm", "basebuddy", "doctor", "--json");
  check((await fetch(`${base}/api/ready`)).ok, "A configured app with a reachable database must be ready.");
  const archive = execFileSync("docker", ["exec", name, "tar", "-czf", "-", "-C", "/app/basebuddy-data", "."], { maxBuffer: 16 * 1024 * 1024 });
  await writeFile(join(folder, "app-data.tar.gz"), archive, { mode: 0o600 });
  docker("rm", "--force", name); containers.delete(name);
  base = await start(name, volumes[0]);
  await login(base);
  docker("rm", "--force", name); containers.delete(name);
  execFileSync("docker", ["run", "--rm", "--interactive", "--mount", `type=volume,source=${volumes[1]},target=/app/basebuddy-data`, "--entrypoint", "tar", image, "-xzf", "-", "-C", "/app/basebuddy-data"], { input: archive, stdio: ["pipe", "pipe", "pipe"] });
  base = await start(name, volumes[1]);
  await login(base);
  docker("exec", name, "pnpm", "basebuddy", "doctor", "--json");
  console.log("Docker checks passed: non-root runtime, private bootstrap, test-auth exclusion, database readiness, CLI diagnostics, restart persistence, and backup restoration.");
} finally {
  for (const name of containers) { try { docker("rm", "--force", name); } catch {} }
  for (const volume of volumes) { try { docker("volume", "rm", volume); } catch {} }
  await rm(folder, { recursive: true, force: true });
}
