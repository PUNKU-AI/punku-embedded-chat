/* eslint-env node */
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const OUTPUT_PATH = path.resolve(__dirname, "..", "build-icons", "header-icon-overrides.json");
const FIELDS = ["backend_origin", "flow_id", "page_origin", "header_icon"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUrl(value, field, originOnly) {
  if (typeof value !== "string" || value !== value.trim() || /[\\\u0000-\u0020\u007f]/.test(value)) {
    throw new Error(`${field} must be a URL without whitespace or backslashes.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must use HTTPS without credentials, query strings, or fragments.`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname.includes(".") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.includes(":") ||
    /^[\d.]+$/.test(hostname)
  ) {
    throw new Error(`${field} must use a public hostname.`);
  }
  if (originOnly && !/^https:\/\/[^/?#]+\/?$/i.test(value)) {
    throw new Error(`${field} must contain only an origin.`);
  }
  return originOnly ? url.origin : url.href;
}

function parseOverrides(input) {
  if (input === undefined || input === null || input.trim() === "") return null;
  if (Buffer.byteLength(input, "utf8") > 65536) {
    throw new Error("Header icon configuration exceeds 64 KiB.");
  }
  let entries;
  try {
    entries = JSON.parse(input);
  } catch {
    throw new Error("Header icon configuration must be valid JSON.");
  }
  if (!Array.isArray(entries) || entries.length > 100) {
    throw new Error("Header icon configuration must be an array with at most 100 entries.");
  }
  const selectors = new Set();
  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).length !== FIELDS.length ||
      FIELDS.some((field) => !Object.hasOwn(entry, field))
    ) {
      throw new Error("Each entry must contain only backend_origin, flow_id, page_origin, and header_icon.");
    }
    if (typeof entry.flow_id !== "string" || !UUID.test(entry.flow_id)) {
      throw new Error("flow_id must be a UUID.");
    }
    const match = [
      validateUrl(entry.backend_origin, "backend_origin", true),
      entry.flow_id.toLowerCase(),
      validateUrl(entry.page_origin, "page_origin", true),
    ];
    const selector = createHash("sha256").update(JSON.stringify(match), "utf8").digest("hex");
    if (selectors.has(selector)) throw new Error("Header icon configuration contains a duplicate match.");
    selectors.add(selector);
    return { selector, header_icon: validateUrl(entry.header_icon, "header_icon", false) };
  });
}

function writeManifest(input, outputPath = OUTPUT_PATH) {
  const entries = parseOverrides(input);
  if (entries === null) return false;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(entries)}\n`);
  return true;
}

if (require.main === module) {
  try {
    const publish = writeManifest(process.env.WIDGET_HEADER_ICON_OVERRIDES_JSON);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
    }
    console.log(publish ? "Validated header icon overrides for publication." : "No override variable; preserve the CDN manifest.");
  } catch (error) {
    console.error(`Header icon override validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseOverrides, writeManifest };
