# Widget browser tests

These tests load `dist/build/static/js/bundle.min.js`, built from the current source.
Each browser profile checks that the fixture serves that exact file.
They keep the widget shadow root closed.
Test instrumentation records the returned root without changing its mode.
Playwright then sends real mouse, keyboard, and touch input.

## Coverage

| Profile | Engine | Input and layout |
| --- | --- | --- |
| Desktop Chromium | Chromium | Mouse and keyboard |
| Desktop Firefox | Firefox | Mouse and keyboard |
| Desktop WebKit | WebKit | Mouse and keyboard |
| Android | Chromium | Pixel 7 emulation and touch |
| iPhone | WebKit | iPhone 13 emulation and touch |
| Narrow phone | Chromium | 320 x 568 viewport and touch |
| Landscape phone | WebKit | Landscape iPhone emulation and touch |
| Tablet | WebKit | iPad emulation and touch |

Hint checks cover text, colors, opacity, screen bounds, three placements, long text, resizing, opening, closing, timeout, and session persistence.
Oversized hints must scroll so users can reach their text.
Unit tests verify that closed chats preserve focus and cancel pending input focus when closing or unmounting.
Link checks cover nested Markdown text, branding links, exact URLs, query strings, fragments, opener protection, and referrer protection.
Desktop checks also cover Enter, modified Enter, and middle-click.
Phone and tablet checks use touch.
Every test checks for uncaught page errors.

The Nitro fixture reproduces cancellation, a cached outside event path, delayed element listeners, and a replay on the widget host.
An unprotected closed-root control must fail navigation under that fixture.
Protected links must open exactly one destination after the replay queue settles.
Pages without interception must keep native navigation.

The fixture contains no copied vendor code, customer keys, or customer data.
It forces the interception contract on every engine, including engines the vendor currently excludes.
It does not establish compatibility with every NitroPack version.
Separate browser verification used the Museum's captured loader for the original link fix.

Device profiles use emulation.
They do not prove behavior on physical phones or the branded Chrome and Safari applications.
Tests block outside requests and use local synthetic destinations.

## Run locally

Check for other test jobs before starting this suite.
The suite and bundle build use explicit worker limits.

```sh
npm ci --legacy-peer-deps
npx playwright install chromium firefox webkit
npm run typecheck:browser
CI=false npm run build:release
npm run test:release-contract
npm run test:browser
```

Run one profile with `npm run test:browser -- --project=iphone`.
Do not increase the worker count on a shared machine.

CI builds current source before running the matrix.
CI and release validation use the same composite action.
Linux runs WebKit under Xvfb and keeps Chromium and Firefox headless.
Chromium uses the full browser's new headless mode.
CI uses the matching Playwright image with a fixed digest.
Resize checks synchronize WebKit's virtual display, verify bounds, then save the settled screenshot.
Keyboard checks wait for initial input focus before they focus a link.
The matrix uses one worker.
CI saves screenshots, failure traces, and the HTML report for 14 days.
Local evidence stays under `output/playwright` and is ignored by Git.

## Real Gemini checks in CI

Gemini can review visibility, clipping, overlap, and readability.
Browser assertions prove that links open.
CI sends 40 synthetic screenshots to the real Gemini API after the browser matrix passes.
Each of eight profiles provides four visible-hint screenshots and one disabled-hint control.
The runner requires all screenshots from the completed browser report before sending any request.
It makes ten serial requests, with four images in each request and no retries.
Missing, unreadable, clipped, or uncertain visible hints fail the check.
Disabled-hint controls must return no visible hint.
Free-text observations remain advisory because a floating hint can cover background page text.

The checker uses [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) by default.
CI pins that model explicitly.
Use an image-understanding model for screenshots.

The widget repository provides the encrypted `GEMINI_API_KEY` secret only to the live review step.
Trusted repository PRs and pushes to `main` run the real review.
A missing key fails trusted runs.
Fork and Dependabot PRs run browser tests, but skip the live review because GitHub withholds their secrets.
CI saves the sanitized Gemini results with the browser evidence.
The results include the build commit and SHA256 checksums for the bundle and license.
The checker verifies those files before and after its API calls.

Run the same checks locally after generating the browser report:

```sh
npm run test:visual-live
```

## Release gate

The release workflow builds the bundle once before testing it.
Browser checks, real Gemini checks, and checksum checks must pass before publication.
The publish job downloads the tested artifact and verifies its commit and checksums.
It uploads that artifact without rebuilding the JavaScript bundle.

The tag's committed bundle and license must also match the tested files.
This keeps jsDelivr and githack fallback files equal to the primary CDN file.

Rebuild and commit `dist` before creating a release tag.
Wait for CI on that commit to pass before pushing the tag.
Tag-based fallback CDNs can serve a pushed tag before the publish workflow finishes.
Old tags without these gate files cannot pass the new release workflow.

## Manual screenshot review

Set `GEMINI_API_KEY` through your secure shell environment.
Pass one to four synthetic fixture PNGs explicitly.
The command sends those images to Google.
It rejects paths outside `output/playwright`, duplicate images, unsupported models, and oversized files.
It limits the response and validates the returned JSON.

```sh
npm run audit:visual -- output/playwright/results/widget-hint-left-visible-text-colors-and-viewport-bounds-narrow-phone/hint-left.png
```

`npm run test:visual-audit` remains available for local API-client unit tests.
These unit tests do not replace the real Gemini checks in CI.
