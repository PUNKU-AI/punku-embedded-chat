/*
 * Builds the header icon set that the widget loads from the PUNKU CDN.
 *
 * The platform lets customers pick any Lucide icon for `header_icon_name`.
 * The widget does not bundle the icon set. It loads one SVG file by name from
 * `chat/icons/lucide/` on the CDN. See publish-icons.yml and SELF_HOSTING.md.
 *
 * File names are normalized: lower case, letters and digits only. The widget
 * and the platform normalize names the same way, so "MessageSquare",
 * "message-square" and "messageSquare" all resolve to "messagesquare.svg".
 *
 * Sources:
 *   - node_modules/lucide-static/icons  (the current Lucide set, with aliases)
 *   - assets/lucide-legacy              (icons that Lucide 1.x removed)
 *
 * Output: build-icons/lucide/<name>.svg, manifest.json, LICENSE.txt
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(ROOT, "node_modules", "lucide-static");
const LEGACY_DIR = path.join(ROOT, "assets", "lucide-legacy");
const OUT_DIR = path.join(ROOT, "build-icons", "lucide");

const normalizeIconName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

// The part between <svg ...> and </svg>, with whitespace between tags removed.
const getInnerMarkup = (svg, file) => {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!match) {
    throw new Error(`No <svg> element in ${file}`);
  }
  return match[1].replace(/>\s+</g, "><").trim();
};

const toOutputSvg = (inner, note) =>
  `<!-- ${note} -->\n` +
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  `${inner}</svg>\n`;

const readIcons = (dir) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".svg"))
    .sort()
    .map((file) => ({
      name: file.slice(0, -4),
      inner: getInnerMarkup(fs.readFileSync(path.join(dir, file), "utf8"), file),
    }));

const lucideVersion = require(path.join(STATIC_DIR, "package.json")).version;
const icons = new Map();

const addIcons = (list, note, { allowOverride }) => {
  for (const { name, inner } of list) {
    const key = normalizeIconName(name);
    const existing = icons.get(key);
    if (existing) {
      // Lucide ships aliases as separate files ("arrow-down-0-1" and
      // "arrow-down-01"). They normalize to one name and must be one icon.
      if (existing.inner !== inner && !allowOverride) {
        throw new Error(`"${name}" and "${existing.name}" share the name "${key}" but differ`);
      }
      continue;
    }
    icons.set(key, { name, inner, note });
  }
};

addIcons(readIcons(path.join(STATIC_DIR, "icons")), `lucide-static v${lucideVersion} - ISC`, {
  allowOverride: false,
});
// A current Lucide icon always wins over a legacy icon with the same name.
addIcons(readIcons(LEGACY_DIR), "lucide-react v0.256.0 - ISC (removed from Lucide 1.x)", {
  allowOverride: true,
});

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [key, { inner, note }] of icons) {
  fs.writeFileSync(path.join(OUT_DIR, `${key}.svg`), toOutputSvg(inner, note));
}

fs.writeFileSync(
  path.join(OUT_DIR, "manifest.json"),
  `${JSON.stringify({ lucideVersion, count: icons.size, icons: [...icons.keys()].sort() })}\n`
);
fs.copyFileSync(path.join(STATIC_DIR, "LICENSE"), path.join(OUT_DIR, "LICENSE.txt"));

console.log(`Wrote ${icons.size} icons (Lucide ${lucideVersion}) to ${path.relative(ROOT, OUT_DIR)}`);
