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
Long hints show at most two text lines and end with an ellipsis.
Geometry checks verify this limit and confirm that every placement keeps the chat trigger clickable.
Unit tests verify that closed chats preserve focus and cancel pending input focus when closing or unmounting.
Link checks cover nested Markdown text, branding links, exact URLs, query strings, fragments, opener protection, and referrer protection.
Desktop checks also cover Enter, modified Enter, and middle-click.
Composer checks cover the one-line start height, growth with a long two-sentence message, Shift+Enter line breaks, Enter sending, and the six-line cap with internal scrolling.
Landscape window checks run on short screens: 641-1023 px wide and at most 500 px tall.
For all four chat positions, the open window, its close button, its send button, and the trigger must stay inside the screen.
The window fills the height beside the trigger, 12 px from it, and must not cover it.
With `bottom_offset` 285, as on live pages, the window keeps 240 px: the header, one message line, and the input.
A custom trigger size from `chat_trigger_style` keeps the 12 px gap.
A window that `setTriggerPosition` anchors keeps its place.
The Android profile repeats the checks at 740 x 360 and 844 x 390 on a wide host page, before and after a pan.
Phone and tablet checks use touch.
Every test checks for uncaught page errors.

The Nitro fixture reproduces cancellation, a cached outside event path, delayed element listeners, and a replay on the widget host.
An unprotected closed-root control must fail navigation under that fixture.
Protected links must open exactly one destination after the replay queue settles.
Pages without interception must keep native navigation.
Checkout checks verify an in-page modal, one explicit fallback tab, unsupported-dialog recovery, and modified desktop clicks under Nitro interception.
Desktop checks open checkout with Enter, close it with Escape, and use restored link focus to reopen it with Enter.
All profiles verify opener focus after the close button and the active checkout frame's close message.
These focus checks run with and without Nitro interception and require the chat to stay open without a popup.
They serve a synthetic checkout page at the expected URL and block all provider requests.

Host page checks add a host element that is wider than the viewport.
The open widget must not move the visual viewport after load, after a restored session, after a new answer, or when checkout opens and closes.
Each check records the largest `visualViewport` offset from page start, so a pan that moves back still fails.
The message list must still scroll to the newest message.
When checkout closes, focus must return to the booking link, and the message list must scroll to show that link.
These checks send messages through the widget API, because a Playwright click or tap scrolls the page on its own.
On the same wide page, the open window, its close button, and its send button must stay inside the visual viewport.
This applies after load, after a pan of the visible area, with `top_offset`, and after `setTriggerPosition`.
The landscape phone profile skips these checks, because its layout rises above the screen on every page (#77).
The trigger keeps its offsets from the corner of the visual viewport, before and after a pan.
The closed hint shows next to it, and the trigger does not overlap the open window.
The Bookingkit checkout dialog and its close button stay inside the visual viewport. Up to 767 px, the dialog fills it.
On a page that fits the screen, the trigger stays 20 px from the layout viewport corner, also next to a desktop scrollbar.
The `android` profile also runs the open window at 839 × 412 px. This landscape size uses the 768–1023 px layout.

Playwright cannot open an on-screen keyboard. The keyboard checks install a visual viewport that is 45 % shorter, as the keyboard makes it on iOS Safari and in Chrome on Android 108 and later.
On a page that fits the screen, the closed trigger stays at the layout viewport corner, behind the keyboard.
On a page wider than the screen, the closed trigger moves above the keyboard, before and after a pan.
The open window, its header, close button and send button, and the trigger stay above the keyboard in every layout.
The `android` profile also runs this at 839 × 412 px with a 200 px keyboard.
Geometry checks wait until each box is at full scale and stays the same in two reads, because the window scales in when it opens.

Feedback checks cover positive and negative votes, header overrides, empty responses, error rollback, and retry.
Local servers record the actual HTTP headers and body on both origins.
Tests verify same-origin cookies, blocked cross-origin cookies, and no copied XSRF headers on every profile.

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
nvm use
npm ci
npm run audit:dependencies
npx playwright install chromium firefox webkit
npx tsc --noEmit
npm run typecheck:browser
npm run build:release
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
Intentional two-line truncation is valid when every displayed line and the complete bubble border remain inside the viewport.
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

The release workflow audits all dependencies, including development tools, before building the bundle.
Any reported vulnerability fails the audit. The workflow does not omit packages or suppress findings.
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
