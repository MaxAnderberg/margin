// Tests for the release pipeline's configuration: version numbers,
// release-please settings and how the GitHub workflows fit together.
// (actionlint checks the workflow syntax itself; see .github/workflows/ci.yml.)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));
const yaml = (path: string) => parseYaml(read(path));

const manifestVersion: string = json(".release-please-manifest.json")["."];
const config = json("release-please-config.json");
const pkg = config.packages["."];
const buildWorkflow = yaml(".github/workflows/build.yml");
const releaseWorkflow = yaml(".github/workflows/release-please.yml");

/** Resolves a simple `$.a.b` JSONPath (all that release-please is configured with here). */
function select(data: unknown, path: string): unknown {
  expect(path, "only simple $.a.b paths are supported").toMatch(/^\$(\.[\w-]+)+$/);
  return path
    .slice(2)
    .split(".")
    .reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], data);
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
  ])("%s matches the manifest", (_, version) => {
    expect(version()).toBe(manifestVersion);
  });
  // Cargo.lock is not checked: release-please can't update it, and cargo
  // rewrites margin's entry on the next build.
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
    "extra file %s exists and its path points at the current version",
    (_, file) => {
      expect(existsSync(join(root, file.path))).toBe(true);
      const data = file.type === "toml" ? parseToml(read(file.path)) : json(file.path);
      expect(select(data, file.jsonpath)).toBe(manifestVersion);
    },
  );

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

  it("exposes the outputs the build job reads", () => {
    const outputs = Object.keys(releaseWorkflow.jobs["release-please"].outputs);
    expect(outputs).toEqual(expect.arrayContaining(["release_created", "tag_name"]));
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
