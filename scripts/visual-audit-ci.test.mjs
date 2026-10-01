import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { collectScreenshots, evaluateScreens } from "./visual-audit-ci.mjs";

const REPO_ROOT = "/synthetic/widget";
const PROFILES = ["desktop-chromium", "desktop-firefox", "desktop-webkit", "android", "iphone", "narrow-phone", "phone-landscape", "tablet"];
const HINT_SCENES = ["hint-left", "hint-top", "hint-bottom", "hint-resized"];
const SCENES = [...HINT_SCENES, "hint-disabled"];

function browserReport() {
  return {
    config: { projects: PROFILES.map((name) => ({ name })) },
    stats: { unexpected: 0, flaky: 0 },
    suites: [{ suites: [{ specs: SCENES.map((scene) => ({
      tests: PROFILES.map((projectName) => ({
        projectName,
        results: [{
          status: "passed",
          retry: 0,
          attachments: [{
            name: `gemini-${scene}`,
            contentType: "image/png",
            path: path.join(REPO_ROOT, "output/playwright/results", projectName, `${scene}.png`),
          }],
        }],
      })),
    })) }] }],
  };
}

function firstResult(report) {
  return report.suites[0].suites[0].specs[0].tests[0].results[0];
}

function visibleCheck(scene = "hint-left") {
  return { profile: "iphone", scene, hint: "visible", legibility: "readable", clipping: "none" };
}

function visibleScreen(index = 1) {
  return { index, hint: "visible", legibility: "readable", clipping: "none", issues: [] };
}

test("collects all 40 screenshots into ten batches of four", () => {
  const report = browserReport();
  const original = JSON.stringify(report);
  const batches = collectScreenshots(report, REPO_ROOT);
  assert.equal(batches.length, 10);
  assert.deepEqual(batches.map((batch) => batch.name), [...PROFILES, "disabled-controls-1", "disabled-controls-2"]);
  assert.ok(batches.every((batch) => batch.screenshots.length === 4 && batch.checks.length === 4));
  const screenshots = batches.flatMap((batch) => batch.screenshots);
  assert.equal(screenshots.length, 40);
  assert.equal(new Set(screenshots).size, 40);
  assert.ok(screenshots.every((screenshot) => screenshot.startsWith("output/playwright/results/") && !path.isAbsolute(screenshot)));
  assert.equal(JSON.stringify(report), original);
  for (const [index, profile] of PROFILES.entries()) {
    assert.deepEqual(batches[index].checks, HINT_SCENES.map((scene) => ({ profile, scene, hint: "visible", legibility: "readable", clipping: "none" })));
    assert.deepEqual(batches[index].screenshots, HINT_SCENES.map((scene) => `output/playwright/results/${profile}/${scene}.png`));
  }
  assert.deepEqual(batches.slice(8).flatMap((batch) => batch.checks), PROFILES.map((profile) => ({
    profile, scene: "hint-disabled", hint: "not_visible", legibility: "not_applicable", clipping: "not_applicable",
  })));
});

test("collects profiles in a stable order when the report lists projects in reverse", () => {
  const report = browserReport();
  report.config.projects.reverse();
  assert.deepEqual(collectScreenshots(report, REPO_ROOT).slice(0, 8).map((batch) => batch.name), PROFILES);
});

test("rejects missing report metadata and missing, duplicate, or unknown profiles", () => {
  const missingProfile = browserReport();
  missingProfile.config.projects.pop();
  const duplicateProfile = browserReport();
  duplicateProfile.config.projects[7].name = PROFILES[0];
  const unknownProfile = browserReport();
  unknownProfile.config.projects[7].name = "unknown-browser";
  const missingStats = browserReport();
  delete missingStats.stats;
  for (const report of [undefined, {}, missingProfile, duplicateProfile, unknownProfile, missingStats]) {
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /successful browser run with all eight profiles and no retries/);
  }
});

test("rejects a browser run with failed or flaky tests", () => {
  for (const field of ["unexpected", "flaky"]) {
    const report = browserReport();
    report.stats[field] = 1;
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /successful browser run/);
  }
});

test("requires every hint scene and disabled control from every profile", () => {
  for (const sceneIndex of [0, 4]) {
    const report = browserReport();
    report.suites[0].suites[0].specs[sceneIndex].tests[4].results[0].attachments = [];
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /missing required Gemini screenshots for iphone/);
  }
});

test("rejects duplicate scene attachments within one result or across tests", () => {
  const sameResult = browserReport();
  const result = firstResult(sameResult);
  result.attachments.push({ ...result.attachments[0] });
  const separateTest = browserReport();
  const tests = separateTest.suites[0].suites[0].specs[0].tests;
  tests.push(structuredClone(tests[0]));
  for (const report of [sameResult, separateTest]) {
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /invalid Gemini screenshot attachment/);
  }
});

test("rejects screenshot attachments from nonpassed results", () => {
  for (const status of ["failed", "timedOut", "skipped", "interrupted"]) {
    const report = browserReport();
    firstResult(report).status = status;
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /invalid Gemini screenshot attachment/);
  }
});

test("rejects retried results even when their final status passed", () => {
  for (const retry of [1, 2, undefined]) {
    const report = browserReport();
    firstResult(report).retry = retry;
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /invalid Gemini screenshot attachment/);
  }
});

test("rejects attachments with unknown scenes, profiles, formats, or missing paths", () => {
  const unknownScene = browserReport();
  firstResult(unknownScene).attachments[0].name = "gemini-chat-open";
  const unknownProfile = browserReport();
  unknownProfile.suites[0].suites[0].specs[0].tests[0].projectName = "unknown-browser";
  const wrongFormat = browserReport();
  firstResult(wrongFormat).attachments[0].contentType = "image/jpeg";
  const missingPath = browserReport();
  delete firstResult(missingPath).attachments[0].path;
  for (const report of [unknownScene, unknownProfile, wrongFormat, missingPath]) {
    assert.throws(() => collectScreenshots(report, REPO_ROOT), /invalid Gemini screenshot attachment/);
  }
});

test("ignores ordinary browser attachments without weakening required evidence", () => {
  const report = browserReport();
  firstResult(report).attachments.push({ name: "trace", contentType: "application/zip", path: "output/playwright/results/trace.zip" });
  assert.equal(collectScreenshots(report, REPO_ROOT).flatMap((batch) => batch.screenshots).length, 40);
});

test("maps valid visual results by image index rather than response order", () => {
  const checks = HINT_SCENES.map(visibleCheck);
  const screens = [4, 2, 1, 3].map(visibleScreen);
  const results = evaluateScreens(checks, screens);
  assert.ok(results.every((result) => result.passed));
  assert.deepEqual(results.map((result) => result.actual.index), [1, 2, 3, 4]);
  assert.deepEqual(results.map(({ actual, passed, ...expected }) => expected), checks);
});

test("fails missing visual results without throwing or passing other images incorrectly", () => {
  const results = evaluateScreens([visibleCheck("hint-left"), visibleCheck("hint-top")], [visibleScreen(2)]);
  assert.equal(results[0].passed, false);
  assert.equal(results[0].actual, undefined);
  assert.equal(results[1].passed, true);
});

test("fails visible hints that Gemini finds clipped, unreadable, unclear, or absent", () => {
  const findings = [
    { clipping: "clipped" },
    { clipping: "unclear" },
    { legibility: "unreadable" },
    { legibility: "unclear" },
    { hint: "unclear" },
    { hint: "not_visible", legibility: "not_applicable", clipping: "not_applicable" },
  ];
  for (const finding of findings) {
    const result = evaluateScreens([visibleCheck()], [{ ...visibleScreen(), ...finding }])[0];
    assert.equal(result.passed, false, JSON.stringify(finding));
  }
});

test("requires disabled controls to have no hint and no applicable text or clipping", () => {
  const expected = { profile: "tablet", scene: "hint-disabled", hint: "not_visible", legibility: "not_applicable", clipping: "not_applicable" };
  const absent = { index: 1, hint: "not_visible", legibility: "not_applicable", clipping: "not_applicable", issues: [] };
  assert.equal(evaluateScreens([expected], [absent])[0].passed, true);
  for (const finding of [
    visibleScreen(),
    { ...absent, hint: "unclear" },
    { ...absent, legibility: "unclear" },
    { ...absent, clipping: "unclear" },
  ]) {
    assert.equal(evaluateScreens([expected], [finding])[0].passed, false);
  }
  assert.equal(evaluateScreens([expected], [])[0].passed, false);
});
