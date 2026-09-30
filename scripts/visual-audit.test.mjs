import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditScreenshots, DEFAULT_MODEL, main } from "./visual-audit.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z1sAAAAASUVORK5CYII=", "base64");
const ENV = { GEMINI_API_KEY: "test-only-fake-key" };
const screen = (index = 1) => ({ index, hint: "visible", legibility: "readable", issues: [] });
const success = (screens = [screen()]) => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ screens }) }] } }] }) });

async function fixture(t) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "widget-visual-audit-"));
  const folder = path.join(repoRoot, "output", "playwright");
  await mkdir(folder, { recursive: true });
  const screenshot = "output/playwright/fixture-hint.png";
  await writeFile(path.join(repoRoot, screenshot), PNG);
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  return { repoRoot, screenshots: [screenshot] };
}

test("sends one explicit fixture with a bounded JSON schema and a header-only key", async (t) => {
  const input = await fixture(t);
  let calls = 0;
  const result = await auditScreenshots({ ...input, env: ENV, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-goog-api-key"], ENV.GEMINI_API_KEY);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body.includes(ENV.GEMINI_API_KEY), false);
    const body = JSON.parse(options.body);
    assert.equal(body.contents.length, 1);
    assert.equal(body.contents[0].parts.length, 3);
    assert.match(body.contents[0].parts[0].text, /Do not claim that links work/);
    assert.deepEqual(body.contents[0].parts[2], { inlineData: { mimeType: "image/png", data: PNG.toString("base64") } });
    assert.equal(body.generationConfig.maxOutputTokens, 2048);
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "MINIMAL");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema.properties.screens.maxItems, 1);
    assert.deepEqual(body.generationConfig.responseJsonSchema.required, ["screens"]);
    assert.equal("tools" in body, false);
    return success();
  } });
  assert.equal(calls, 1);
  assert.equal(result.model, DEFAULT_MODEL);
  assert.deepEqual(result.screens, [screen()]);
  assert.deepEqual(result.images, [{ index: 1, name: "fixture-hint.png" }]);
});

test("allows the cheaper 3.1 model override", async (t) => {
  const input = await fixture(t);
  await auditScreenshots({ ...input, env: { ...ENV, GEMINI_MODEL: "gemini-3.1-flash-lite" }, fetchImpl: async (url) => {
    assert.match(url, /gemini-3\.1-flash-lite:generateContent$/);
    return success();
  } });
});

test("missing keys and unsupported models never call the API", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return success(); };
  await assert.rejects(auditScreenshots({ screenshots: [], env: {}, fetchImpl }), /Set GEMINI_API_KEY/);
  await assert.rejects(auditScreenshots({ screenshots: [], env: { ...ENV, GEMINI_MODEL: "unknown-model" }, fetchImpl }), /supported Flash-Lite/);
  assert.equal(calls, 0);
});

test("accepts at most four unique screenshots and rejects outside paths", async (t) => {
  const input = await fixture(t);
  let calls = 0;
  const run = (screenshots) => auditScreenshots({ ...input, screenshots, env: ENV, fetchImpl: async () => { calls += 1; return success(); } });
  await assert.rejects(run([]), /between one and four/);
  await assert.rejects(run(Array(5).fill(input.screenshots[0])), /between one and four/);
  await assert.rejects(run(["../private.png"]), /stay inside/);
  await assert.rejects(run(["https://example.com/image.png"]), /stay inside/);
  await assert.rejects(run([input.screenshots[0], input.screenshots[0]]), /only once/);
  assert.equal(calls, 0);
});

test("rejects file symlinks that leave output/playwright", async (t) => {
  const input = await fixture(t);
  await writeFile(path.join(input.repoRoot, "outside.png"), PNG);
  await symlink(path.join(input.repoRoot, "outside.png"), path.join(input.repoRoot, "output/playwright/escape.png"));
  await assert.rejects(auditScreenshots({ ...input, screenshots: ["output/playwright/escape.png"], env: ENV, fetchImpl: () => assert.fail("API must not run") }), /symlink points outside/);
});

test("rejects a screenshot folder symlink", async (t) => {
  const input = await fixture(t);
  await rm(path.join(input.repoRoot, "output/playwright"), { recursive: true });
  await mkdir(path.join(input.repoRoot, "outside"));
  await symlink(path.join(input.repoRoot, "outside"), path.join(input.repoRoot, "output/playwright"));
  await assert.rejects(auditScreenshots({ ...input, env: ENV, fetchImpl: () => assert.fail("API must not run") }), /folder must not point outside/);
});

test("rejects non-PNG, oversized, and invalid image files before upload", async (t) => {
  const input = await fixture(t);
  const run = () => auditScreenshots({ ...input, env: ENV, fetchImpl: () => assert.fail("API must not run") });
  await writeFile(path.join(input.repoRoot, input.screenshots[0]), "not a PNG image");
  await assert.rejects(run(), /PNG file/);
  await writeFile(path.join(input.repoRoot, input.screenshots[0]), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(run(), /smaller than two MiB/);
  const invalid = Buffer.from(PNG);
  invalid.fill(0, 0, 8);
  await writeFile(path.join(input.repoRoot, input.screenshots[0]), invalid);
  await assert.rejects(run(), /not a supported PNG/);
});

test("rejects incomplete, malformed, duplicated, or contradictory results", async (t) => {
  const input = await fixture(t);
  const badScreens = [[], [{ ...screen(), index: 2 }], [{ ...screen(), legibility: true }], [{ ...screen(), extra: true }], [{ ...screen(), issues: [" "] }], [{ ...screen(), hint: "not_visible" }]];
  for (const screens of badScreens) {
    await assert.rejects(auditScreenshots({ ...input, env: ENV, fetchImpl: async () => success(screens) }), /invalid visual review/);
  }
  await assert.rejects(auditScreenshots({ ...input, env: ENV, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }) }) }), /complete visual review/);
  await assert.rejects(auditScreenshots({ ...input, env: ENV, fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] }) }) }), /invalid visual review/);
  await writeFile(path.join(input.repoRoot, "output/playwright/fixture-chat.png"), PNG);
  await assert.rejects(auditScreenshots({ ...input, screenshots: [...input.screenshots, "output/playwright/fixture-chat.png"], env: ENV, fetchImpl: async () => success([screen(), screen()]) }), /invalid visual review/);
});

test("keeps review findings advisory and redacts errors and accidental key echoes", async (t) => {
  const input = await fixture(t);
  let output = [];
  const options = { ...input, env: ENV, write: (line) => output.push(line) };
  assert.equal(await main(input.screenshots, { ...options, fetchImpl: async () => success([{ ...screen(), issues: [`Overlap ${ENV.GEMINI_API_KEY}`] }]) }), 0);
  assert.match(output.join("\n"), /Manual review is required/);
  assert.match(output.join("\n"), /\[redacted\]/);
  assert.equal(output.join("\n").includes(ENV.GEMINI_API_KEY), false);
  output = [];
  assert.equal(await main(input.screenshots, { ...options, fetchImpl: async () => { throw new Error(`Network error ${ENV.GEMINI_API_KEY}`); } }), 1);
  assert.equal(output.join("\n").includes(ENV.GEMINI_API_KEY), false);
  assert.match(output.join("\n"), /details were withheld/i);
  output = [];
  assert.equal(await main(input.screenshots, { ...options, fetchImpl: async () => ({ ok: false, text: () => assert.fail("Do not read error details") }) }), 1);
  assert.equal(output.join("\n").includes(ENV.GEMINI_API_KEY), false);
});

test("help never reads credentials or calls Gemini", async () => {
  const output = [];
  assert.equal(await main(["--help"], { env: {}, write: (line) => output.push(line), fetchImpl: () => assert.fail("API must not run") }), 0);
  assert.match(output.join("\n"), /synthetic fixture screenshots/);
});
