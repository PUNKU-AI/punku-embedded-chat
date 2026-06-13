# Codebase Audit — Vetted Findings

- **Audited at**: commit `79a247b` (feat/custom-trigger-icon), recorded on `main` at `221afea` (PR #36 merge), 2026-06-11
- **Method**: 8 parallel category auditors (correctness, security, performance, tests, tech-debt, dependencies, DX/docs, direction), one adversarial verifier per finding (56 agents), plus a manual read of every core source file by the lead advisor. ~Half of the 48 raw findings were rejected or downgraded during verification.
- **Coverage**: all of `src/`, configs, docs, dependency manifests. NOT audited: `working_folder_dialogue_impact/` (client files, gitignored), internals of the committed `dist/` bundle, `public/fonts`.
- **Status**: findings recorded; implementation plans not yet written (pending maintainer selection).

## Repo facts (recon)

- React 18 + TypeScript 4.9 strict; `npx tsc --noEmit` passes cleanly (usable as a verification gate).
- Jest via react-scripts; tests beside every component; run: `npm test -- --watchAll=false`.
- No CI (`.github/` absent). No lint/typecheck npm scripts (ESLint runs implicitly inside react-scripts).
- `dist/build/static/js/bundle.min.js` (3.0MB raw, ~0.92MB gzipped) is committed deliberately — jsDelivr serves it from the repo.
- `src/chatWidget/index.tsx` (3,208 lines) is ~470 lines of logic + ~2,570 lines of inline CSS template strings + ~360KB of base64 fonts on two lines (308, 316).
- Highest churn since Sept 2025: `chatWindow/index.tsx`, `chatWidget/index.tsx`.

---

## Findings (ordered by leverage)

### [F1] Streaming errors destroy the user's just-sent message; parse failures silently swallowed

- **Evidence**:
  - `src/chatWidget/chatWindow/index.tsx:349-359` — the stream error callback calls `updateLastMessage(...)`, which replaces the *last* entry of the messages array. When a stream fails before the first bot token arrives (the common failure case), the last entry is the user's own message — it is silently replaced by the error bubble.
  - `src/controllers/index.ts:179-182` — empty `catch (parseError)` swallows `JSON.parse` failures on stream lines; `onStreamError` is never invoked for malformed chunks, so partial data loss is invisible to the caller.
  - `src/controllers/index.ts:185-189` — after calling `onStreamError`, `streamMessage` re-throws; the caller (`chatWindow/index.tsx:279`) never awaits/catches the promise → unhandled promise rejection in the host page's console on every stream error.
- **Impact**: any backend hiccup eats the user's message (no retry possible, message gone from history/localStorage) and produces console noise on customer sites.
- **Effort**: M · **Risk**: LOW · **Confidence**: HIGH (verified by direct read)
- **Fix sketch**: append the error as a *new* message instead of replacing the last one (or only replace when the last message is the in-flight bot message); surface parse errors to `onStreamError` or count/log them; `.catch()` the `streamMessage` call (error already handled via callback).

### [F2] `show_feedback` prop is dead — feedback thumbs always render

- **Evidence**:
  - `src/chatWidget/chatWindow/index.tsx:67,124` — `show_feedback` accepted (default `false`) but never referenced again; not passed to `ChatMessage`.
  - `src/chatWidget/chatWindow/chatMessage/index.tsx:197` — feedback buttons render unconditionally for every non-error bot message except the welcome message.
  - `README.md` documents `show_feedback` default `false` as the control for these buttons.
- **Impact**: customers cannot turn feedback buttons off; documented behavior is false.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: thread `show_feedback` into `ChatMessage` and gate the feedback UI on it; add a regression test for both states.

### [F3] 3.0MB bundle (~0.92MB gzipped) shipped to every customer page

- **Evidence**:
  - `src/chatWidget/index.tsx:308,316` — two ~180KB base64 TTF fonts (Euclid Circular B, Swarovski theme only) inline in source, shipped to all themes; also injected into every host page's `document.head` unconditionally (`chatWidget/index.tsx:175-189`).
  - `src/chatWidget/chatWindow/index.tsx:2` — `import * as LucideIcons from "lucide-react"` defeats tree-shaking for the entire icon library (only needed to resolve `header_icon_name` by string).
  - `package.json` — `axios` kept as a runtime dependency for a single function (`sendFeedback`, `controllers/index.ts:220`); the other two API calls already use `fetch`. `react-shadow` and `web-vitals` are never imported anywhere in `src/`.
  - `src/chatPlaceholder/index.tsx:68` — ~12KB base64 PNG crystal loader inline (Swarovski only, shipped to all).
- **Impact**: slow first paint on third-party customer pages; base64 inflates fonts ~33% and gzips poorly. Comparable widgets target <300KB.
- **Effort**: M · **Risk**: MED (font loading for Swarovski must keep working) · **Confidence**: HIGH
- **Fix sketch**: load fonts via URL (jsDelivr `public/fonts/`) only when `theme === "swarovski"`; replace the namespace lucide import with named imports + a small explicit icon map for `header_icon_name`; convert `sendFeedback` to `fetch` and drop `axios`, `react-shadow`, `web-vitals`; move the loader PNG to a hosted asset.

### [F4] Default branding hardcoded to "PUNKU.AI & bookingkit" for all themes; `punku-ai-bookingkit` theme has no styling

- **Evidence**:
  - `src/chatWidget/chatWindow/index.tsx:437-468` — `statusBranding` JSX hardcodes both PUNKU.AI and bookingkit links; used at line 801 whenever `online && !online_message`, regardless of theme. The `translations` `onlineMessage` ("Powered by PUNKU.AI") is unused for this.
  - `grep theme-punku-ai-bookingkit src/chatWidget/index.tsx` → 0 hits — the advertised theme produces no styling; README markets it as a distinct theme.
- **Impact**: every customer not setting `online_message` advertises bookingkit; a documented theme is a no-op.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: default branding to PUNKU.AI only; show the bookingkit variant only for `theme === "punku-ai-bookingkit"`; either style that theme or document it as branding-only.

### [F5] Session storage written during render; `session_id` prop recreates the session every render

- **Evidence**:
  - `src/chatWidget/index.tsx:134` — `SessionStorage.getOrCreateSession(...)` called in the component body (render phase). Every render performs localStorage reads/writes; with the `session_id` prop set, `getOrCreateSession` takes the `providedSessionId` branch (`sessionStorage.ts:205-212`) and **creates a fresh session each render** — overwriting stored messages with `[]` and resetting expiry timestamps.
  - `src/utils/sessionStorage.ts:134-135,163` — `config.expiryHours || DEFAULT` means an explicit `0` falls back to the default (can't disable/short-set TTL).
- **Impact**: storage thrash on every render; with `session_id` set, persisted history is repeatedly clobbered (masked partially by the auto-save effect); React 18 StrictMode double-invocation makes it worse.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: move session init into `useState(() => ...)` lazy initializer or a `useRef`/`useEffect`; use `??` instead of `||` for the config defaults; add a test that renders twice and asserts a single session creation.

### [F6] Default "thinking" placeholder messages are German-only for all languages

- **Evidence**: `src/chatPlaceholder/index.tsx:11-42` — `defaultThinkingMessages` is a German-only array used for every non-Swarovski theme regardless of the `language` prop (only the Swarovski crystalline messages are bilingual).
- **Impact**: English-language users see "Überlege…", "Denke nach…" etc. while waiting for responses.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: move the default thinking messages into `src/translations/index.ts` keyed by language (en + de), select by the `language` prop; test both languages.

### [F7] Dead-code cluster (including an unreachable API path with broken error handling)

- **Evidence**:
  - `src/chatWidget/index.tsx:3194` — `enable_streaming={true}` hardcoded; not registered as a web-component prop in `src/index.tsx` → the entire non-streaming branch (`chatWindow/index.tsx:200-273` + `sendMessage` in `controllers/index.ts:3-60`) is unreachable in production.
  - `src/chatWidget/chatWindow/index.tsx:251-273` — that dead branch's error handling checks `err.code === "ERR_NETWORK"` and `err.response` (axios shapes), but `sendMessage` uses `fetch`, which never produces them — if the path were ever re-enabled, all errors would be silent.
  - `src/chatWidget/chatWindow/index.tsx:152-169` — `windowPosition` state is set but never read (render uses `fixedWindowHorizontalStyle`); `getChatPosition` and `getAnimationOrigin` (`chatWidget/utils.ts`) are dead along with it; `PunkuLogo` imported (line 9) but never rendered.
  - `src/components/LanguageSwitcher.tsx`, `src/reportWebVitals.ts` — never imported.
  - `src/chatWidget/index.tsx:72` — phantom *required* prop `input_value: string` in the type literal, never destructured nor registered in `src/index.tsx`.
- **Impact**: confusion for maintainers, latent broken path, wasted bundle bytes.
- **Effort**: S–M · **Risk**: LOW (deletions; the non-streaming removal is a decision: delete vs. fix-and-expose) · **Confidence**: HIGH
- **Fix sketch**: decide fate of non-streaming mode (delete, or fix its error handling and expose `enable_streaming`); delete the unused state/utils/components/prop; remove dead deps (overlaps F3).

### [F8] God-file: ~2,570 lines of CSS template strings inside the component; theme logic scattered

- **Evidence**:
  - `src/chatWidget/index.tsx:304-1801` (`styles`) and `1803-3036` (`markdownBody`) — giant CSS template literals defined *inside* the component body, rebuilt on every render; the font-injection effect (`:175-189`) regexes the ~370KB string each mount.
  - Theme behavior branches by name in 4+ files: `chatWidget/index.tsx:151` (Swarovski → German), `chatTrigger/index.tsx:28` (Swarovski icon), `chatPlaceholder/index.tsx:49` (crystalline loader), inline CSS theme blocks.
- **Impact**: every new client theme (swarovski, bookingkit, dialoghaus…) requires edits across the codebase; the main file is effectively unreviewable.
- **Effort**: M–L · **Risk**: MED (visual regressions; needs theme-by-theme verification) · **Confidence**: HIGH
- **Fix sketch**: hoist CSS strings to module-level constants in dedicated files; introduce a theme registry (`src/themes/`) mapping theme → {defaultLanguage, icons, loaderMessages, css}; components read the registry instead of branching on names.

### [F9] Dying build toolchain (strategic migration)

- **Evidence**:
  - `package.json:19` — react-scripts 5 (deprecated by the React team, no releases since 2022); `:24` — `uglifyjs-webpack-plugin` 2.2.0 (abandoned; its webpack-4 peer dependency is the verified root cause of the `--legacy-peer-deps` requirement in the build script, `:30`); TS 4.9; `webpack.config.js` concatenates CRA output as a second build pass.
  - `npm audit`: 69 vulns (3 critical) — verified to be almost entirely CRA build-time noise, not runtime exposure (runtime calls use `fetch`; axios is one function and is removed by F3).
- **Impact**: unfixable audit noise, fragile install, no upstream fixes coming. Builds do work today — this is strategic, not urgent.
- **Effort**: L · **Risk**: MED · **Confidence**: HIGH
- **Fix sketch**: migrate to Vite library mode (single IIFE/UMD bundle output replaces the CRA+webpack double build), Vitest or keep Jest, modern TS. Blast radius: build scripts, jest config, `dist/` output path expected by jsDelivr consumers (must keep the same committed path).

### [F10] No CI

- **Evidence**: no `.github/` directory; tests and `npx tsc --noEmit` exist and pass but nothing runs them; releases are hand-built bundles committed to `dist/`.
- **Impact**: regressions ride straight into the CDN-served bundle. This is the verification baseline that should precede risky plans.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: GitHub Actions workflow on PR + main: `npm ci --legacy-peer-deps`, `npx tsc --noEmit`, `npm test -- --watchAll=false`. Optionally a job verifying `npm run build` succeeds.

### [F11] Docs drift

- **Evidence**:
  - `README.md:170-217` (config table) omits registered props: `api_key`, `header_icon_name`, `widget_id`, `loading_messages`, `chat_output_key`, `ttl_hours`, `idle_expiration_hours`, `bottom_offset`, `top_offset` (some have prose sections; table is the reference). Theme tables (`:23-31`, `:354-358`) omit `swarovski`.
  - `CLAUDE.md` claims `default_language` supports en, de, es, fr, it, pt — only en/de exist (`src/translations/index.ts:63`). README (`:282`) is correct (en/de).
  - `AGENTS.md` (untracked) near-duplicates CLAUDE.md.
- **Impact**: integrators discover props from examples that the reference table doesn't list; internal docs over-promise languages.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: regenerate the README table from `src/index.tsx` prop registration (the source of truth); fix CLAUDE.md language claim; track or delete AGENTS.md.

---

## Direction findings (maintainer options, not ranked against bugs)

- **[D1] Integration events on the global API** — `window['<widget_id>_api']` exposes only `open/close/isOpen` (`chatWidget/index.tsx:292-296`); customers cannot hook message/error/feedback/session events for analytics without intercepting network traffic. Additive and non-breaking (CustomEvent or callback registry). Grounded in `PROGRAMMATIC_CONTROL.md`. (~M)
- **[D2] Deliver or de-scope the promised languages** — internal docs promise 6 languages, code has 2; translation structure makes each locale a code change. Restructure for drop-in locale files (fixes F6 structurally) or correct the docs. (~M)
- **[D3] Mobile layout presets** — three separate PRs accreted one-off offset props (`bottom_offset`, `top_offset`); a `mobile_layout` preset/config object would stop the prop sprawl. (~M, MED confidence)
- **[D4] Theme builder UI** — ~55 styling props and hand-coded client themes (swarovski, bookingkit, dialoghaus) suggest a config/preview tool; biggest effort, separate product surface. (~L, speculative)

## Considered and rejected (do not re-audit)

- **"Committed API keys / flow IDs in demos"** — refuted: `demos/` is gitignored and `git ls-files demos` is empty; nothing was ever committed. ⚠️ Caution: the *local* demo files do contain real `sk-` API keys and this folder syncs via Dropbox — keep them out of git; rotate if those files were ever shared.
- **XSS via markdown links** — react-markdown v8 sanitizes `javascript:` URIs by default; links get `target="_blank" rel="noopener noreferrer"` (`chatMessage/index.tsx:186-190`). Not exploitable as claimed.
- **"UglifyJS outputs broken ES5"** — refuted: it minifies without transpiling; the shipped bundle retains ES6+ and works.
- **"`updateLastMessage` mutation causes missed re-renders"** — the spread creates a new array reference, so React re-renders; in-place element mutation (`chatWidget/index.tsx:166`) is style-only cleanup, folded into F1's touch area if desired.
- **Testing libraries in `dependencies` instead of `devDependencies`** — CRA convention; does not affect the shipped bundle; not worth a plan.
- **"69 npm vulnerabilities" as a standalone emergency** — verified mostly build-time/transitive; the actionable pieces are F3 (drop axios) and F9 (toolchain migration).
- **Per-message inline style objects / index keys / missing memo** — real but minor; only matters during streaming re-renders and is naturally addressed if F8's restructuring happens. Not worth standalone plans.
