import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const release = `sha-${"a".repeat(40)}-100-1`;
const previous = `sha-${"b".repeat(40)}-99-1`;
const image = `ghcr.io/example/taskfolio-api@sha256:${"a".repeat(64)}`;
const previousImage = `ghcr.io/example/taskfolio-api@sha256:${"b".repeat(64)}`;
const token = "test-only-registry-token";
let directory;
let app;
let environment;

// Run the actual scripts with process-boundary fakes, never SSH or a real daemon.
const mock = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const envFile = args.includes('--env-file') ? args[args.indexOf('--env-file') + 1] : null;
const target = envFile ? path.basename(path.dirname(envFile)) : null;
const entry = { command, args, target, authDirectory: process.env.DOCKER_CONFIG, imageOverride: process.env.API_IMAGE };
if (command === 'ssh') {
  const key = args[args.indexOf('-i') + 1];
  entry.keyMode = fs.statSync(key).mode & 0o777;
  entry.keyMatches = fs.readFileSync(key, 'utf8').trim() === 'test-private-key';
}
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(entry) + '\\n');
const isNew = target === process.env.RELEASE_ID;
if (command === 'flock' && process.env.FAIL_STEP === 'lock') process.exit(1);
if (command === 'docker') {
  if (args[0] === 'ps') process.stdout.write(process.env.PORT_OWNER || '');
  if (args[0] === 'image' && process.env.FAIL_STEP === 'previous-image') process.exit(1);
  if (args[0] === 'login') {
    if (fs.readFileSync(0, 'utf8') !== process.env.EXPECTED_TOKEN) process.exit(2);
    fs.writeFileSync(path.join(process.env.DOCKER_CONFIG, 'config.json'), 'temporary credential');
    if (process.env.FAIL_STEP === 'login') process.exit(1);
  }
  for (const step of ['config', 'pull']) {
    if (isNew && args.includes(step) && process.env.FAIL_STEP === step) process.exit(1);
  }
  if (args.includes('up')) {
    fs.writeFileSync(process.env.RUNNING_FILE, target);
    if (isNew && process.env.FAIL_STEP === 'signal') process.kill(process.ppid, 'SIGTERM');
    if (isNew && process.env.FAIL_STEP === 'up' || !isNew && process.env.FAIL_ROLLBACK === '1') process.exit(1);
  }
}
if (command === 'curl') {
  const running = fs.existsSync(process.env.RUNNING_FILE) ? fs.readFileSync(process.env.RUNNING_FILE, 'utf8') : '';
  const failed = running === process.env.RELEASE_ID && process.env.FAIL_STEP === 'http';
  const auth = args.at(-1).endsWith('/api/auth/me');
  let status = auth ? '401' : '200';
  let body = JSON.stringify(auth ? { code: 'UNAUTHENTICATED' } : { status: 'ready' });
  if (failed) {
    const mode = process.env.HTTP_FAILURE;
    if (mode === 'redirect') status = '302';
    else if (mode === 'html') body = '<html>SPA fallback</html>';
    else if (mode === 'auth' && auth) body = JSON.stringify({ code: 'WRONG_PROXY' });
    else if (mode !== 'auth') status = '503';
  }
  fs.writeFileSync(args[args.indexOf('--output') + 1], body);
  process.stdout.write(status);
}
if (command === 'jq') {
  if (args.includes('-n')) {
    process.stdout.write(JSON.stringify({ cliPluginsExtraDirs: [args[args.indexOf('plugins') + 1]] }));
    process.exit(0);
  }
  try {
    const data = JSON.parse(fs.readFileSync(args.at(-1), 'utf8'));
    const okay = args.includes('.status == "ready"') ? data.status === 'ready' : data.code === 'UNAUTHENTICATED';
    process.exit(okay ? 0 : 1);
  } catch { process.exit(1); }
}
if (command === 'ssh') {
  if (process.env.FAIL_STEP === 'ssh') process.exit(255);
  if (args.at(-1).includes('remote-deploy.sh') && fs.readFileSync(0, 'utf8') !== process.env.EXPECTED_TOKEN) process.exit(2);
}
`;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "taskfolio-cd-"));
  app = path.join(directory, "app");
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  await mkdir(path.join(directory, "tmp"));
  for (const id of [release, previous]) {
    await mkdir(path.join(app, "releases", id), { recursive: true });
    await copyFile(path.join(repo, "compose.production.yaml"), path.join(app, "releases", id, "compose.production.yaml"));
  }
  for (const command of ["docker", "curl", "jq", "flock", "sleep", "ssh", "scp"]) {
    const file = path.join(bin, command);
    await writeFile(file, mock);
    await chmod(file, 0o755);
  }
  await writeFile(path.join(app, "backend.env"), "server-owned-secrets\n");
  await writeFile(path.join(app, "current-release"), `${previous}\n`);
  await writeFile(path.join(app, "releases", previous, "images.env"), `API_IMAGE=${previousImage}\nBACKEND_ENV_FILE=${app}/backend.env\n`);
  environment = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: path.join(directory, "tmp"),
    COMMAND_LOG: path.join(directory, "commands.jsonl"),
    RUNNING_FILE: path.join(directory, "running"),
    EXPECTED_TOKEN: token,
    FAIL_STEP: "", FAIL_ROLLBACK: "", HTTP_FAILURE: "",
    PORT_OWNER: "container-id taskfolio-backend\n",
    RELEASE_ID: release, API_IMAGE: image,
    BACKEND_ENV_FILE: "/wrong/ambient.env",
    GHCR_USER: "example", GHCR_TOKEN: token,
    EC2_HOST: "ec2.example.com", EC2_USER: "ec2-user", EC2_PORT: "2222", EC2_APP_DIR: app,
    EC2_SSH_KEY: "test-private-key\r\n", EC2_KNOWN_HOSTS: "[ec2.example.com]:2222 ssh-ed25519 test-key",
    BACKEND_ORIGIN: "https://api.example.com", FRONTEND_ORIGIN: "https://app.vercel.app",
  };
});

afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function run(script, args = [], overrides = {}) {
  return spawnSync("bash", [path.join(repo, "deploy", script), ...args], {
    env: { ...environment, ...overrides }, input: token, encoding: "utf8", timeout: 15000,
  });
}
function deploy(overrides = {}) {
  return run("remote-deploy.sh", [app, release, image, environment.GHCR_USER, environment.BACKEND_ORIGIN, environment.FRONTEND_ORIGIN], overrides);
}
async function commands() {
  if (!existsSync(environment.COMMAND_LOG)) return [];
  return (await readFile(environment.COMMAND_LOG, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}
async function current() { return readFile(path.join(app, "current-release"), "utf8"); }

describe("backend CD", () => {
  it("pulls before replacing, pins the digest, checks Caddy/Vercel JSON, and records a healthy release", async () => {
    const result = deploy();
    expect(result.status, result.stderr).toBe(0);
    const log = await commands();
    const pull = log.findIndex((e) => e.args.includes("pull"));
    const up = log.findIndex((e) => e.args.includes("up"));
    expect(pull).toBeGreaterThan(-1);
    expect(up).toBeGreaterThan(pull);
    expect(log[up].args.slice(-9)).toEqual(["up", "--detach", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "180", "api"]);
    expect(log[up].imageOverride).toBeUndefined();
    expect(log.filter((e) => e.command === "curl").map((e) => e.args.at(-1))).toEqual([
      "http://127.0.0.1:5001/health/ready", "https://api.example.com/health/ready", "https://app.vercel.app/api/auth/me",
    ]);
    expect(await current()).toBe(`${release}\n`);
    expect(await readFile(path.join(app, "previous-release"), "utf8")).toBe(`${previous}\n`);
    expect(await readFile(path.join(app, "backend.env"), "utf8")).toBe("server-owned-secrets\n");
    expect(await readFile(path.join(app, "releases", release, "images.env"), "utf8")).toBe(`API_IMAGE=${image}\nBACKEND_ENV_FILE=${app}/backend.env\n`);
    expect(existsSync(log.find((e) => e.args[0] === "login").authDirectory)).toBe(false);
    expect(JSON.stringify(log) + result.stdout + result.stderr).not.toContain(token);
  });

  it.each(["config", "previous-image", "login", "pull"])("keeps the running API untouched when %s fails", async (step) => {
    const result = deploy({ FAIL_STEP: step });
    expect(result.status).not.toBe(0);
    expect(await current()).toBe(`${previous}\n`);
    const log = await commands();
    expect(log.some((e) => e.args.includes("up") || e.args.includes("down"))).toBe(false);
    for (const entry of log.filter((e) => e.authDirectory)) expect(existsSync(entry.authDirectory)).toBe(false);
  });

  it.each(["up", "http", "signal"])("restores the previous release and still fails the job after %s failure", async (step) => {
    const result = deploy({ FAIL_STEP: step });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Rollback healthy");
    expect(await current()).toBe(`${previous}\n`);
    expect((await commands()).filter((e) => e.args.includes("up")).map((e) => e.target)).toEqual([release, previous]);
  });

  it.each(["redirect", "html", "auth"])("rejects a %s response and rolls back instead of reporting success", async (mode) => {
    const result = deploy({ FAIL_STEP: "http", HTTP_FAILURE: mode });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Rollback healthy");
    expect(await current()).toBe(`${previous}\n`);
  });

  it("reports rollback failure without promoting the failed release", async () => {
    const result = deploy({ FAIL_STEP: "up", FAIL_ROLLBACK: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ROLLBACK FAILED");
    expect(await current()).toBe(`${previous}\n`);
  });

  it("cleans up an unsuccessful first deployment with no previous release", async () => {
    await rm(path.join(app, "current-release"));
    const result = deploy({ PORT_OWNER: "", FAIL_STEP: "up" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no previous managed release");
    expect(existsSync(path.join(app, "current-release"))).toBe(false);
    expect((await commands()).some((e) => e.target === release && e.args.includes("down"))).toBe(true);
  });

  it("supports the initial deployment once the API port is free", async () => {
    await rm(path.join(app, "current-release"));
    const result = deploy({ PORT_OWNER: "" });
    expect(result.status, result.stderr).toBe(0);
    expect(await current()).toBe(`${release}\n`);
  });

  it("refuses to replace an unmanaged API container", async () => {
    const result = deploy({ PORT_OWNER: "manual-container \n" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unmanaged container");
    expect((await commands()).some((e) => e.args.includes("up"))).toBe(false);
  });

  it("fails without touching Docker when configuration is missing or the deploy lock is held", async () => {
    expect(deploy({ FAIL_STEP: "lock" }).status).not.toBe(0);
    expect((await commands()).some((e) => e.command === "docker")).toBe(false);
    await rm(path.join(app, "backend.env"));
    expect(deploy().status).not.toBe(0);
    expect((await commands()).some((e) => e.command === "docker")).toBe(false);
  });
});

describe("CD SSH transport", () => {
  it("pins the host key, copies only release files, and sends a short-lived token over stdin", async () => {
    const result = run("deploy.sh");
    expect(result.status, result.stderr).toBe(0);
    const log = await commands();
    expect(log.map((e) => e.command)).toEqual(["ssh", "scp", "ssh"]);
    for (const entry of log.filter((e) => e.command === "ssh")) {
      expect(entry.args).toContain("StrictHostKeyChecking=yes");
      expect(entry.args).toContain("2222");
      expect(entry.keyMode).toBe(0o600);
      expect(entry.keyMatches).toBe(true);
      expect(existsSync(entry.args[entry.args.indexOf("-i") + 1])).toBe(false);
    }
    expect(log[1].args.slice(-3, -1)).toEqual([path.join(repo, "compose.production.yaml"), path.join(repo, "deploy", "remote-deploy.sh")]);
    expect(JSON.stringify(log) + result.stdout + result.stderr).not.toContain(token);
  });

  it("stops and removes the temporary key if SSH fails", async () => {
    expect(run("deploy.sh", [], { FAIL_STEP: "ssh" }).status).not.toBe(0);
    const log = await commands();
    expect(log.map((e) => e.command)).toEqual(["ssh"]);
    expect(existsSync(log[0].args[log[0].args.indexOf("-i") + 1])).toBe(false);
  });

  it.each([
    { API_IMAGE: "ghcr.io/example/taskfolio-api:latest" }, { RELEASE_ID: `${release}; evil` },
    { EC2_HOST: "host; evil" }, { EC2_PORT: "70000" }, { EC2_APP_DIR: "/opt/taskfolio' unsafe" },
    { EC2_APP_DIR: "/opt/../etc" }, { FRONTEND_ORIGIN: "http://app.example.com" },
    { BACKEND_ORIGIN: "https://api.example.com/path" },
  ])("rejects invalid arguments before SSH: %j", async (overrides) => {
    expect(run("deploy.sh", [], overrides).status).not.toBe(0);
    expect(await commands()).toEqual([]);
  });
});
