# Widget browser tests

These tests load a production bundle built from the current source.
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
CI=false npm run build:browser-tests
npm run test:browser
```

Run one profile with `npm run test:browser -- --project=iphone`.
Do not increase the worker count on a shared machine.

CI builds current source before running the matrix.
Linux runs WebKit under Xvfb and keeps Chromium and Firefox headless.
Chromium uses the full browser's new headless mode.
CI uses the matching Playwright image with a fixed digest.
Resize checks save a screenshot to synchronize WebKit's virtual display before checking the rendered bounds.
Keyboard checks wait for initial input focus before they focus a link.
The matrix uses one worker.
CI saves screenshots, failure traces, and the HTML report for 14 days.
Local evidence stays under `output/playwright` and is ignored by Git.

## Optional Gemini screenshot review

Gemini can review visibility, clipping, overlap, and readability.
Browser assertions prove that links open.
Gemini observations require human review and do not change browser test results.

The checker uses [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) by default.
`GEMINI_MODEL=gemini-3.1-flash-lite` selects the cheaper supported model.
Use an image-understanding model for screenshots.

Set `GEMINI_API_KEY` through your secure shell environment.
Pass one to four synthetic fixture PNGs explicitly.
The command sends those images to Google.
It rejects paths outside `output/playwright`, duplicate images, unsupported models, and oversized files.
It limits the response and validates the returned JSON.

```sh
npm run audit:visual -- output/playwright/results/widget-hint-left-visible-text-colors-and-viewport-bounds-narrow-phone/hint-left.png
```

CI does not use an API key or make paid model calls.
`npm run test:visual-audit` checks the optional checker with fake API responses.
