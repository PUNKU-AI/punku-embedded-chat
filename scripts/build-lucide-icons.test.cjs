/* eslint-env node */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildLucideIcons } = require("./build-lucide-icons.js");

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "punku-lucide-icons-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dirs = {
    staticDir: path.join(root, "lucide-static"),
    legacyDir: path.join(root, "legacy"),
    overrideDir: path.join(root, "overrides"),
    outDir: path.join(root, "output"),
  };
  fs.mkdirSync(path.join(dirs.staticDir, "icons"), { recursive: true });
  fs.mkdirSync(dirs.legacyDir);
  fs.mkdirSync(dirs.overrideDir);
  fs.writeFileSync(path.join(dirs.staticDir, "package.json"), JSON.stringify({ version: "1.47.0" }));
  fs.writeFileSync(path.join(dirs.staticDir, "LICENSE"), "ISC license fixture\n");
  const write = (dir, name, inner) => fs.writeFileSync(path.join(dir, `${name}.svg`), svg(inner));
  const current = (name, inner) => write(path.join(dirs.staticDir, "icons"), name, inner);
  const legacy = (name, inner) => write(dirs.legacyDir, name, inner);
  const override = (name, inner) => write(dirs.overrideDir, name, inner);
  const read = (name) => fs.readFileSync(path.join(dirs.outDir, name), "utf8");
  return { dirs, current, legacy, override, read };
};

test("an override replaces the current icon after legacy processing and retains ISC provenance", (t) => {
  const f = fixture(t);
  f.current("message-square-text", '<path d="M1 1h2"/>');
  f.legacy("MessageSquareText", '<path d="M2 2h3"/>');
  f.override("message-square-text", '<polygon points="2,2 22,2 22,20 2,20" fill="#046035"/>');

  const result = buildLucideIcons(f.dirs);

  assert.equal(result.count, 1);
  const output = f.read("messagesquaretext.svg");
  assert.match(output, /lucide-static v1\.47\.0 - ISC; PUNKU SVG override: message-square-text\.svg/);
  assert.match(output, /<polygon points="2,2 22,2 22,20 2,20" fill="#046035"\/>/);
  assert.doesNotMatch(output, /<path/);
  assert.equal(f.read("LICENSE.txt"), "ISC license fixture\n");
  assert.deepEqual(JSON.parse(f.read("manifest.json")), {
    lucideVersion: "1.47.0", count: 1, icons: ["messagesquaretext"],
  });
});

test("normal icons keep their previous output and the current icon wins over legacy", (t) => {
  const f = fixture(t);
  f.current("bot", '<circle cx="12" cy="12" r="4"/>');
  f.legacy("Bot", '<path d="M1 1h2"/>');

  buildLucideIcons(f.dirs);

  assert.equal(f.read("bot.svg"),
    '<!-- lucide-static v1.47.0 - ISC -->\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="4"/></svg>\n');
});

test("an override can replace a legacy icon and preserves its source notice", (t) => {
  const f = fixture(t);
  f.legacy("legacy-icon", '<path d="M1 1h2"/>');
  f.override("LegacyIcon", '<rect x="2" y="2" width="20" height="20" fill="#046035"/>');

  buildLucideIcons(f.dirs);

  assert.match(f.read("legacyicon.svg"), /lucide-react v0\.256\.0 - ISC \(removed from Lucide 1\.x\)/);
  assert.match(f.read("legacyicon.svg"), /PUNKU SVG override: LegacyIcon\.svg/);
});

test("an unknown override fails before replacing the previous output", (t) => {
  const f = fixture(t);
  f.current("bot", '<circle cx="12" cy="12" r="4"/>');
  f.override("does-not-exist", '<rect x="2" y="2" width="20" height="20"/>');
  fs.mkdirSync(f.dirs.outDir);
  fs.writeFileSync(path.join(f.dirs.outDir, "previous.txt"), "keep previous build");

  assert.throws(() => buildLucideIcons(f.dirs), /Override "does-not-exist" does not match an existing Lucide icon/);
  assert.equal(f.read("previous.txt"), "keep previous build");
});

test("duplicate override names fail after normalization", (t) => {
  const f = fixture(t);
  f.current("message-square-text", '<path d="M1 1h2"/>');
  f.override("MessageSquareText", '<rect x="2" y="2" width="20" height="20"/>');
  f.override("message-square-text", '<circle cx="12" cy="12" r="4"/>');

  assert.throws(() => buildLucideIcons(f.dirs), /Overrides .* share the name "messagesquaretext"/);
  assert.equal(fs.existsSync(f.dirs.outDir), false);
});

test("the builder supports repositories without an override directory", (t) => {
  const f = fixture(t);
  f.current("bot", '<circle cx="12" cy="12" r="4"/>');
  fs.rmSync(f.dirs.overrideDir, { recursive: true });

  assert.equal(buildLucideIcons(f.dirs).count, 1);
  assert.doesNotMatch(f.read("bot.svg"), /override/);
});

test("different current icons with the same normalized name still fail", (t) => {
  const f = fixture(t);
  f.current("arrow-down-0-1", '<path d="M1 1h2"/>');
  f.current("arrow-down-01", '<path d="M2 2h3"/>');

  assert.throws(() => buildLucideIcons(f.dirs), /share the name "arrowdown01" but differ/);
});
