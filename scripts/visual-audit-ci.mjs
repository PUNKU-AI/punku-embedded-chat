#!/usr/bin/env node
// Enforce real Gemini checks on screenshots from the completed browser run.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditScreenshots, loadScreenshots } from "./visual-audit.mjs";
import releaseBundle from "./release-bundle.cjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILES = ["desktop-chromium", "desktop-firefox", "desktop-webkit", "android", "iphone", "narrow-phone", "phone-landscape", "tablet"];
const HINT_SCENES = ["hint-left", "hint-top", "hint-bottom", "hint-resized"];
const SCENES = [...HINT_SCENES, "hint-disabled"];
const RESULT_PATH = path.join(REPO_ROOT, "output/playwright/gemini-visual-review.json");

function fail(message) {
  throw new Error(message);
}

export function collectScreenshots(report, repoRoot = REPO_ROOT) {
  const profiles = report?.config?.projects?.map((project) => project.name);
  if (!Array.isArray(profiles) || profiles.length !== PROFILES.length || new Set(profiles).size !== PROFILES.length ||
    PROFILES.some((profile) => !profiles.includes(profile)) || report.stats?.unexpected !== 0 || report.stats?.flaky !== 0) {
    fail("The Gemini check requires a successful browser run with all eight profiles and no retries.");
  }
  const selected = new Map(PROFILES.map((profile) => [profile, new Map()]));
  function visit(suites) {
    for (const suite of suites || []) {
      visit(suite.suites);
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          for (const result of test.results || []) {
            for (const attachment of result.attachments || []) {
              if (!attachment.name.startsWith("gemini-")) continue;
              const scene = attachment.name.slice("gemini-".length);
              const profile = selected.get(test.projectName);
              if (!profile || !SCENES.includes(scene) || profile.has(scene) || result.status !== "passed" || result.retry !== 0 ||
                attachment.contentType !== "image/png" || typeof attachment.path !== "string") {
                fail("The browser report contains an invalid Gemini screenshot attachment.");
              }
              profile.set(scene, path.relative(repoRoot, path.resolve(repoRoot, attachment.path)));
            }
          }
        }
      }
    }
  }
  visit(report.suites);
  const batches = [];
  const controls = [];
  for (const profile of PROFILES) {
    const images = selected.get(profile);
    if (SCENES.some((scene) => !images.has(scene))) fail(`The browser run is missing required Gemini screenshots for ${profile}.`);
    batches.push({
      name: profile,
      screenshots: HINT_SCENES.map((scene) => images.get(scene)),
      checks: HINT_SCENES.map((scene) => ({ profile, scene, hint: "visible", legibility: "readable", clipping: "none" })),
    });
    controls.push({ profile, scene: "hint-disabled", screenshot: images.get("hint-disabled") });
  }
  for (let index = 0; index < controls.length; index += 4) {
    const group = controls.slice(index, index + 4);
    batches.push({
      name: `disabled-controls-${index / 4 + 1}`,
      screenshots: group.map((control) => control.screenshot),
      checks: group.map(({ profile, scene }) => ({ profile, scene, hint: "not_visible", legibility: "not_applicable", clipping: "not_applicable" })),
    });
  }
  return batches;
}

export function evaluateScreens(checks, screens) {
  return checks.map((expected, index) => {
    const actual = screens.find((screen) => screen.index === index + 1);
    const passed = !!actual && ["hint", "legibility", "clipping"].every((field) => actual[field] === expected[field]);
    return { ...expected, actual, passed };
  });
}

export async function main() {
  const report = { model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite", startedAt: new Date().toISOString(), passed: false, batches: [] };
  try {
    if (!process.env.GEMINI_API_KEY?.trim()) fail("GEMINI_API_KEY is missing from the widget repository's CI secrets.");
    report.bundle = releaseBundle.verifyBundleIdentity();
    const browserReport = JSON.parse(await readFile(path.join(REPO_ROOT, "output/playwright/test-results.json"), "utf8"));
    const batches = collectScreenshots(browserReport);
    // Validate every image before the first paid request. The client validates again.
    for (const batch of batches) await loadScreenshots(batch.screenshots);
    await mkdir(path.dirname(RESULT_PATH), { recursive: true });
    for (const batch of batches) {
      const result = await auditScreenshots({ screenshots: batch.screenshots });
      const checks = evaluateScreens(batch.checks, result.screens);
      report.batches.push({ name: batch.name, model: result.model, images: result.images, checks });
      await writeFile(RESULT_PATH, JSON.stringify(report, null, 2));
      for (const check of checks) {
        process.stdout.write(`${check.passed ? "PASS" : "FAIL"} Gemini ${check.profile}/${check.scene}: hint ${check.actual?.hint ?? "missing"}, legibility ${check.actual?.legibility ?? "missing"}, clipping ${check.actual?.clipping ?? "missing"}.\n`);
      }
    }
    report.completedAt = new Date().toISOString();
    releaseBundle.verifyBundleIdentity();
    report.passed = report.batches.every((batch) => batch.checks.every((check) => check.passed));
    await writeFile(RESULT_PATH, JSON.stringify(report, null, 2));
    if (!report.passed) fail("Real Gemini screenshot checks failed. See gemini-visual-review.json.");
    process.stdout.write(`Real Gemini checks passed: 40 screenshots, eight profiles, ten API calls (${report.model}).\n`);
    return 0;
  } catch (error) {
    // Never print provider error objects, request headers, or credential values.
    const message = error instanceof Error ? error.message : "The real Gemini check failed.";
    const sanitized = message.replaceAll(process.env.GEMINI_API_KEY || "\0", "[redacted]");
    report.error = sanitized;
    await mkdir(path.dirname(RESULT_PATH), { recursive: true });
    await writeFile(RESULT_PATH, JSON.stringify(report, null, 2));
    process.stderr.write(`${sanitized}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
