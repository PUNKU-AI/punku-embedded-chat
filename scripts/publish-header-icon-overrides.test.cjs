/* eslint-env node */
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { parseOverrides, writeManifest } = require("./publish-header-icon-overrides.cjs");

const entry = {
  backend_origin: "https://api.example.com",
  flow_id: "abcdef00-0000-4000-8000-000000000000",
  page_origin: "https://customer.example.com",
  header_icon: "https://cdn.example.com/customer-logo.svg",
};

test("writes hashed selectors without customer identifiers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "header-icon-overrides-"));
  try {
    const file = path.join(directory, "nested", "manifest.json");
    const input = [{ ...entry, backend_origin: `${entry.backend_origin}/`, flow_id: entry.flow_id.toUpperCase() }];
    assert.equal(writeManifest(JSON.stringify(input), file), true);
    const selector = createHash("sha256")
      .update(JSON.stringify([entry.backend_origin, entry.flow_id, entry.page_origin]), "utf8")
      .digest("hex");
    const contents = fs.readFileSync(file, "utf8");
    assert.deepEqual(JSON.parse(contents), [{ selector, header_icon: entry.header_icon }]);
    for (const field of ["backend_origin", "flow_id", "page_origin"]) {
      assert.equal(contents.includes(entry[field]), false);
      assert.equal(contents.includes(field), false);
    }
    assert.deepEqual(parseOverrides("[]"), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects malformed entries, extra fields, and duplicate matches", () => {
  const invalid = [
    "invalid JSON",
    JSON.stringify({ entries: [entry] }),
    JSON.stringify([null]),
    JSON.stringify([{ ...entry, api_key: "example-key" }]),
    JSON.stringify([{ ...entry, flow_id: "your-flow-id" }]),
    JSON.stringify([entry, { ...entry, backend_origin: `${entry.backend_origin}/` }]),
    JSON.stringify(Array.from({ length: 101 }, () => entry)),
    JSON.stringify(["x".repeat(65536)]),
  ];
  for (const input of invalid) assert.throws(() => parseOverrides(input));
});

test("rejects unsafe URLs and origins with paths", () => {
  const invalid = [
    { header_icon: "javascript:alert(1)" },
    { header_icon: "http://cdn.example.com/logo.svg" },
    { header_icon: "https://user:password@cdn.example.com/logo.svg" },
    { header_icon: "https://cdn.example.com/logo.svg?token=example" },
    { header_icon: "https://cdn.example.com/logo.svg?" },
    { header_icon: "https://cdn.example.com/logo.svg#fragment" },
    { header_icon: "https://cdn.example.com/logo.svg#" },
    { header_icon: "https://127.0.0.1/logo.svg" },
    { header_icon: "https://customer.localhost/logo.svg" },
    { header_icon: "https://cdn.example.com\\logo.svg" },
    { backend_origin: "https://api.example.com/api" },
    { backend_origin: "https://api.example.com/api/.." },
    { page_origin: "https://customer.example.com/page" },
  ];
  for (const override of invalid) {
    assert.throws(() => parseOverrides(JSON.stringify([{ ...entry, ...override }])));
  }
});

test("unset configuration leaves the existing manifest untouched", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "header-icon-overrides-"));
  try {
    const file = path.join(directory, "manifest.json");
    const contents = "existing manifest\n";
    fs.writeFileSync(file, contents);
    for (const input of [undefined, null, "", " \n\t"]) {
      assert.equal(writeManifest(input, file), false);
      assert.equal(fs.readFileSync(file, "utf8"), contents);
    }
    assert.equal(writeManifest("[]", file), true);
    assert.equal(fs.readFileSync(file, "utf8"), "[]\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
