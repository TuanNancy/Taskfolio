import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const tag = `sha-${"a".repeat(40)}`;
const previousTag = `sha-${"b".repeat(40)}`;
const token = "test-only-short-lived-registry-token";
let directory;
let appDirectory;
let environment;

// Exercise the real shell scripts without contacting Docker, SSH, or a live server.
const mockCommand = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const entry = {
  command, args, authDirectory: process.env.DOCKER_CONFIG,
  imagePrefix: process.env.IMAGE_PREFIX, appVersion: process.env.APP_VERSION,
};
if (command === "ssh") {
  const key = args[args.indexOf("-i") + 1];
  entry.keyMode = fs.statSync(key).mode & 0o777;
  entry.keyMatches = fs.readFileSync(key, "utf8").trim() === "test-private-key";
}
fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(entry) + "\\n");
if (command === "docker") {
  for (const step of ["config", "pull", "up"]) {
    if (args.includes(step) && process.env.FAIL_STEP === step) process.exit(1);
  }
  if (args[0] === "login") {
    if (fs.readFileSync(0, "utf8") !== process.env.EXPECTED_TOKEN) process.exit(2);
    fs.writeFileSync(path.join(process.env.DOCKER_CONFIG, "config.json"), "temporary credential");
  }
  if (args.includes("exec")) process.stdout.write("todo.example.com\\n");
}
if (command === "curl") {
  if (process.env.FAIL_STEP === "curl") process.exit(22);
  process.stdout.write(process.env.HTTP_STATUS || "200");
}
if (command === "ssh") {
  if (process.env.FAIL_STEP === "ssh") process.exit(255);
  if (args.at(-1).includes("remote-deploy.sh") && fs.readFileSync(0, "utf8") !== process.env.EXPECTED_TOKEN) process.exit(2);
}
`;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "taskfolio-deploy-"));
  appDirectory = path.join(directory, "app");
  const bin = path.join(directory, "bin");
  await Promise.all([
    mkdir(bin),
    mkdir(path.join(directory, "tmp")),
    mkdir(path.join(appDirectory, "deploy"), { recursive: true }),
    mkdir(path.join(appDirectory, "releases", tag), { recursive: true }),
  ]);
  await Promise.all(["docker", "curl", "ssh", "scp"].map(async (name) => {
    const file = path.join(bin, name);
    await writeFile(file, mockCommand);
    await chmod(file, 0o755);
  }));
  await copyFile(path.join(repo, "compose.production.yaml"), path.join(appDirectory, "releases", tag, "compose.production.yaml"));
  await writeFile(path.join(appDirectory, "deploy", ".env.production"), "server-owned-configuration\n");
  await writeFile(path.join(appDirectory, "current-release"), `${previousTag}\n`);
  environment = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: path.join(directory, "tmp"),
    COMMAND_LOG: path.join(directory, "commands.jsonl"),
    EXPECTED_TOKEN: token,
    DOCKER_CONFIG: "",
    APP_VERSION: "stale-server-setting",
    FAIL_STEP: "",
    HTTP_STATUS: "200",
    IMAGE_TAG: tag,
    IMAGE_PREFIX: "ghcr.io/example/taskfolio",
    GHCR_USER: "example",
    GHCR_TOKEN: token,
    EC2_HOST: "ec2.example.com",
    EC2_USER: "ubuntu",
    EC2_PORT: "2222",
    EC2_APP_DIR: appDirectory,
    EC2_SSH_KEY: "test-private-key\r\n",
    EC2_KNOWN_HOSTS: "[ec2.example.com]:2222 ssh-ed25519 test-public-key",
  };
});

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function run(script, args = [], overrides = {}) {
  return spawnSync("bash", [path.join(repo, "deploy", script), ...args], {
    env: { ...environment, ...overrides },
    input: token,
    encoding: "utf8",
    timeout: 10000,
  });
}

function deploy(overrides = {}) {
  return run("remote-deploy.sh", [appDirectory, tag, environment.IMAGE_PREFIX, environment.GHCR_USER], overrides);
}

async function commands() {
  if (!existsSync(environment.COMMAND_LOG)) return [];
  return (await readFile(environment.COMMAND_LOG, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

describe("production deployment", () => {
  it("pulls both images before updating, checks HTTPS, and records success without replacing server secrets", async () => {
    const result = deploy();
    expect(result.status, result.stderr).toBe(0);
    const log = await commands();
    const pull = log.findIndex((entry) => entry.command === "docker" && entry.args.includes("pull"));
    const update = log.findIndex((entry) => entry.command === "docker" && entry.args.includes("up"));
    expect(pull).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(pull);
    expect(log[update].appVersion).toBe(tag);
    expect(log[update].imagePrefix).toBe(environment.IMAGE_PREFIX);
    expect(log[update].args.slice(-8)).toEqual(["up", "--detach", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "180"]);
    expect(log.filter((entry) => entry.command === "curl").map((entry) => entry.args.at(-1)))
      .toEqual(["https://todo.example.com/health/ready", "https://todo.example.com/login"]);
    expect(await readFile(path.join(appDirectory, "current-release"), "utf8")).toBe(`${tag}\n`);
    expect(await readFile(path.join(appDirectory, "deploy", ".env.production"), "utf8")).toBe("server-owned-configuration\n");
    expect(await readFile(path.join(appDirectory, "releases", tag, "images.env"), "utf8"))
      .toBe(`IMAGE_PREFIX=ghcr.io/example/taskfolio\nAPP_VERSION=${tag}\n`);
    const login = log.find((entry) => entry.args[0] === "login");
    expect(existsSync(login.authDirectory)).toBe(false);
    expect(JSON.stringify(log) + result.stdout + result.stderr).not.toContain(token);
  });

  it.each(["config", "pull", "up", "curl"])("does not record success and cleans credentials when %s fails", async (step) => {
    const result = deploy({ FAIL_STEP: step });
    expect(result.status).not.toBe(0);
    expect(await readFile(path.join(appDirectory, "current-release"), "utf8")).toBe(`${previousTag}\n`);
    const log = await commands();
    for (const entry of log.filter((entry) => entry.authDirectory)) expect(existsSync(entry.authDirectory)).toBe(false);
    if (["config", "pull"].includes(step)) expect(log.some((entry) => entry.args.includes("up"))).toBe(false);
  });

  it("rejects redirects instead of reporting a public health check as successful", async () => {
    const result = deploy({ HTTP_STATUS: "302" });
    expect(result.status).not.toBe(0);
    expect(await readFile(path.join(appDirectory, "current-release"), "utf8")).toBe(`${previousTag}\n`);
  });

  it("fails before any Docker operation if the server environment is missing", async () => {
    await rm(path.join(appDirectory, "deploy", ".env.production"));
    const result = deploy();
    expect(result.status).not.toBe(0);
    expect(await commands()).toEqual([]);
  });
});

describe("deployment SSH transport", () => {
  it("pins the host key, transfers only release files, and sends the registry credential through stdin", async () => {
    const result = run("deploy.sh");
    expect(result.status, result.stderr).toBe(0);
    const log = await commands();
    expect(log.map((entry) => entry.command)).toEqual(["ssh", "scp", "ssh"]);
    for (const entry of log.filter((item) => item.command === "ssh")) {
      expect(entry.args).toContain("StrictHostKeyChecking=yes");
      expect(entry.args).toContain("2222");
      expect(entry.keyMode).toBe(0o600);
      expect(entry.keyMatches).toBe(true);
      expect(existsSync(entry.args[entry.args.indexOf("-i") + 1])).toBe(false);
    }
    expect(log[1].args.slice(-3, -1)).toEqual([
      path.join(repo, "compose.production.yaml"), path.join(repo, "deploy", "remote-deploy.sh"),
    ]);
    expect(JSON.stringify(log) + result.stdout + result.stderr).not.toContain(token);
  });

  it("stops before copying releases and removes the SSH key when EC2 is unavailable", async () => {
    const result = run("deploy.sh", [], { FAIL_STEP: "ssh" });
    expect(result.status).not.toBe(0);
    const log = await commands();
    expect(log.map((entry) => entry.command)).toEqual(["ssh"]);
    expect(existsSync(log[0].args[log[0].args.indexOf("-i") + 1])).toBe(false);
  });

  it.each([
    { IMAGE_TAG: "latest" },
    { IMAGE_TAG: `${tag}; touch unexpected` },
    { EC2_APP_DIR: "/opt/taskfolio' unsafe" },
    { EC2_HOST: "host; unsafe" },
    { EC2_PORT: "70000" },
  ])("rejects invalid remote arguments before opening SSH: %j", async (overrides) => {
    const result = run("deploy.sh", [], overrides);
    expect(result.status).not.toBe(0);
    expect(await commands()).toEqual([]);
  });
});
