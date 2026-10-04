// Tests for the release pipeline's configuration: version numbers,
// release-please settings and how the GitHub workflows fit together.
// (actionlint checks the workflow syntax itself; see .github/workflows/ci.yml.)

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// release-please's own updaters, so the tests do exactly what a Release PR will.
const require = createRequire(import.meta.url);
const { GenericJson } = require("release-please/build/src/updaters/generic-json.js");
const { GenericToml } = require("release-please/build/src/updaters/generic-toml.js");
const { Version } = require("release-please/build/src/version.js");

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));
const yaml = (path: string) => parseYaml(read(path));

const manifestVersion: string = json(".release-please-manifest.json")["."];
const config = json("release-please-config.json");
const pkg = config.packages["."];
const buildWorkflow = yaml(".github/workflows/build.yml");
const releaseWorkflow = yaml(".github/workflows/release-please.yml");

/** Margin's own version in a Cargo.lock. */
const lockVersion = (lock: string) =>
  ((parseToml(lock) as any).package as { name: string; version: string }[]).find((p) => p.name === "margin")!.version;

/** Runs release-please's updater for an extra-files entry; returns the new content and any warnings. */
function applyUpdater(file: { type: string; path: string; jsonpath: string }, version: string) {
  const warnings: string[] = [];
  const logger = { warn: (m: unknown) => warnings.push(String(m)), info() {}, debug() {}, error() {}, trace() {} };
  const Updater = file.type === "toml" ? GenericToml : GenericJson;
  const content: string = new Updater(file.jsonpath, Version.parse(version)).updateContent(read(file.path), logger);
  return { content, warnings };
}

describe("version numbers", () => {
  it("is a semver version in the release-please manifest", () => {
    expect(manifestVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each([
    ["package.json", () => json("package.json").version],
    ["package-lock.json", () => json("package-lock.json").version],
    ["package-lock.json (root package)", () => json("package-lock.json").packages[""].version],
    ["src-tauri/tauri.conf.json", () => json("src-tauri/tauri.conf.json").version],
    ["src-tauri/Cargo.toml", () => (parseToml(read("src-tauri/Cargo.toml")) as any).package.version],
    ["src-tauri/Cargo.lock (margin)", () => lockVersion(read("src-tauri/Cargo.lock"))],
  ])("%s matches the manifest", (_, version) => {
    expect(version()).toBe(manifestVersion);
  });
});

describe("release-please config", () => {
  it("has exactly one package at the repo root", () => {
    expect(Object.keys(config.packages)).toEqual(["."]);
  });

  it("produces vX.Y.Z tags, which the build workflow listens for", () => {
    expect(pkg["include-v-in-tag"]).toBe(true);
    expect(pkg["include-component-in-tag"]).toBe(false);
    expect(buildWorkflow.on.push.tags).toContain("v*");
  });

  const extraFiles: { type: string; path: string; jsonpath: string }[] = pkg["extra-files"];
  it.each(extraFiles.map((f) => [f.path, f] as const))(
    "release-please's own updater bumps the version in %s",
    (_, file) => {
      expect(existsSync(join(root, file.path))).toBe(true);
      const { content, warnings } = applyUpdater(file, "9.9.9");
      expect(warnings, "the updater would not modify anything").toEqual([]);
      expect(content).not.toBe(read(file.path));
      expect(content).toContain("9.9.9");
      expect(content).not.toContain(manifestVersion);
    },
  );

  it("does not list Cargo.lock, which its updaters can't select (scripts/sync-cargo-lock.sh handles it)", () => {
    expect(extraFiles.map((f) => f.path)).not.toContain("src-tauri/Cargo.lock");
    // The reason: a JSONPath filter for margin's entry matches nothing.
    const { warnings } = applyUpdater(
      { type: "toml", path: "src-tauri/Cargo.lock", jsonpath: "$.package[?(@.name=='margin')].version" },
      "9.9.9",
    );
    expect(warnings.join()).toContain("No entries modified");
  });

  it("releases on feat and fix commits", () => {
    const visible = pkg["changelog-sections"].filter((s: { hidden?: boolean }) => !s.hidden).map((s: { type: string }) => s.type);
    expect(visible).toEqual(expect.arrayContaining(["feat", "fix"]));
  });

  it("bootstrap-sha is a full commit hash", () => {
    expect(config["bootstrap-sha"]).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("release workflow", () => {
  it("runs on pushes to main with permission to open PRs and create releases", () => {
    expect(releaseWorkflow.on.push.branches).toEqual(["main"]);
    expect(releaseWorkflow.permissions).toMatchObject({ contents: "write", "pull-requests": "write" });
  });

  it("calls the build workflow only when a release was created", () => {
    const job = releaseWorkflow.jobs.build;
    expect(job.uses).toBe("./.github/workflows/build.yml");
    expect(job.needs).toBe("release-please");
    expect(job.if).toContain("release_created == 'true'");
  });

  it("passes every input the build workflow requires, and nothing else", () => {
    const inputs = buildWorkflow.on.workflow_call.inputs as Record<string, { required?: boolean }>;
    const passed = Object.keys(releaseWorkflow.jobs.build.with ?? {});
    const required = Object.entries(inputs).filter(([, i]) => i.required).map(([name]) => name);
    expect(passed).toEqual(expect.arrayContaining(required));
    for (const name of passed) expect(Object.keys(inputs)).toContain(name);
  });

  it("exposes the outputs the build and sync jobs read", () => {
    const outputs = Object.keys(releaseWorkflow.jobs["release-please"].outputs);
    expect(outputs).toEqual(expect.arrayContaining(["release_created", "tag_name", "prs_created", "pr"]));
  });

  it("syncs Cargo.lock on the Release PR branch whenever release-please creates or updates it", () => {
    const job = releaseWorkflow.jobs["sync-cargo-lock"];
    expect(job.needs).toBe("release-please");
    expect(job.if).toContain("prs_created == 'true'");
    const checkout = job.steps.find((s: { uses?: string }) => s.uses?.startsWith("actions/checkout"));
    expect(checkout.with.ref).toContain("fromJSON(needs.release-please.outputs.pr).headBranchName");
    const script: string = job.steps.map((s: { run?: string }) => s.run ?? "").join("\n");
    expect(script).toContain("scripts/sync-cargo-lock.sh");
    expect(script).toContain(".release-please-manifest.json");
    expect(script).toContain("git push");
  });
});

describe("scripts/sync-cargo-lock.sh", () => {
  const run = (...args: string[]) =>
    execFileSync("bash", [join(root, "scripts/sync-cargo-lock.sh"), ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  const copyOfLock = () => {
    const path = join(mkdtempSync(join(tmpdir(), "margin-lock-")), "Cargo.lock");
    copyFileSync(join(root, "src-tauri/Cargo.lock"), path);
    return path;
  };

  it("changes only Margin's version line", () => {
    const path = copyOfLock();
    run("9.9.9", path);
    const before = read("src-tauri/Cargo.lock").split("\n");
    const after = readFileSync(path, "utf8").split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed).toEqual(['version = "9.9.9"']);
    expect(lockVersion(readFileSync(path, "utf8"))).toBe("9.9.9");
  });

  it("is idempotent", () => {
    const path = copyOfLock();
    run("9.9.9", path);
    const once = readFileSync(path, "utf8");
    run("9.9.9", path);
    expect(readFileSync(path, "utf8")).toBe(once);
  });

  it("rejects something that isn't a version", () => {
    expect(() => run("not-a-version", copyOfLock())).toThrow(/Not a version/);
  });
});

describe("CI workflow", () => {
  const ci = yaml(".github/workflows/ci.yml");
  const commands = (job: string): string =>
    ci.jobs[job].steps.map((s: { run?: string }) => s.run ?? "").join("\n");

  it("runs on every pull request and on main", () => {
    expect(ci.on).toHaveProperty("pull_request");
    expect(ci.on.push.branches).toEqual(["main"]);
  });

  it("type-checks and runs the unit and pipeline tests", () => {
    expect(commands("frontend")).toContain("tsc --noEmit");
    expect(commands("frontend")).toContain("vitest run");
  });

  it("formats, lints and tests the Rust code", () => {
    for (const cmd of ["cargo fmt --check", "cargo clippy", "-D warnings", "cargo test"]) expect(commands("rust")).toContain(cmd);
  });

  it("lints the workflows with actionlint", () => {
    expect(commands("workflows")).toContain("actionlint");
  });

  it("runs the browser tests in WebKit, the engine Margin uses on Linux and macOS", () => {
    expect(commands("e2e")).toMatch(/playwright install .*webkit/);
    expect(commands("e2e")).toContain("playwright test");
  });
});

describe("build workflow", () => {
  const jobs = buildWorkflow.jobs;
  const matrix: { os: string; args: string }[] = jobs.build.strategy.matrix.include;

  it("builds macOS, Windows and Linux", () => {
    const oses = matrix.map((m) => m.os);
    expect(oses.some((os) => os.startsWith("macos"))).toBe(true);
    expect(oses.some((os) => os.startsWith("windows"))).toBe(true);
    expect(oses.some((os) => os.startsWith("ubuntu"))).toBe(true);
  });

  it("builds a universal macOS app and installs both Rust targets for it", () => {
    const mac = matrix.find((m) => m.os.startsWith("macos"))!;
    expect(mac.args).toContain("universal-apple-darwin");
    const rust = jobs.build.steps.find((s: { uses?: string }) => s.uses?.startsWith("dtolnay/rust-toolchain"));
    expect(rust.with.targets).toContain("aarch64-apple-darwin");
    expect(rust.with.targets).toContain("x86_64-apple-darwin");
  });

  it("can create releases and never cancels a release build", () => {
    expect(buildWorkflow.permissions.contents).toBe("write");
    expect(buildWorkflow.concurrency["cancel-in-progress"]).toContain("pull_request");
  });

  it("uploads an installer for every platform", () => {
    const upload = jobs.build.steps.find((s: { uses?: string }) => s.uses?.startsWith("actions/upload-artifact"));
    const paths: string = upload.with.path;
    for (const ext of ["dmg", "msi", "exe", "deb", "AppImage"]) expect(paths).toContain(`*.${ext}`);
    expect(upload.with["if-no-files-found"]).toBe("error");
  });

  it("only bundles formats that tauri is configured to build", () => {
    expect(json("src-tauri/tauri.conf.json").bundle).toMatchObject({ active: true, targets: "all" });
  });
});
