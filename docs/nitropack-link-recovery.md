# NitroPack link compatibility

NitroPack's interactive optimizer cancels trusted clicks before they reach the widget.
The closed shadow root hides the internal anchor from its window capture handler.
NitroPack later replays the click on the widget host.
That replay cannot activate the original link.

The widget installs a native bubble listener on its shadow root.
Native checkout handlers on anchors run first and prevent navigation when they open a checkout modal.
The recovery listener then handles links that those handlers did not claim.
Both handlers run before NitroPack's delayed element handlers.
It recovers navigation only when NitroPack marks a trusted click for replay and native cancellation is present.
It opens the original HTTP(S) destination synchronously with `noopener,noreferrer`.
It also marks the event prevented to suppress NitroPack's replay.

The handler uses the internal event target.
It cannot use `composedPath()` because NitroPack caches that path outside the closed root.
It reads the native cancellation getter because NitroPack replaces the event's public getter.

## Scope

Recovery covers HTTP(S) links with `_blank` targets inside the widget.
Ordinary clicks, Enter, and Ctrl/Cmd activation use recovery when NitroPack cancels them.
Ctrl/Cmd tab focus can differ from native navigation.
Pages without NitroPack retain native navigation.
Middle-click retains native navigation.

The handler leaves Shift/Alt activation, download links, other targets, and other protocols untouched.
Those actions can still fail when NitroPack cancels their native behavior.
Custom anchor handlers must run synchronously and prevent navigation before the recovery listener runs.

## Validation

The browser reproduction loads the Museum Hamburg optimizer before the widget.
It uses the captured public `nitro-interactive-loader` script without changing the vendor code.
The original bundle fails an ordinary click on a nested Markdown link.
The fixed production bundle opens one destination tab.
Enter and Cmd-Enter also open one tab each.
Middle-click opens one tab without invoking recovery.
The URL retains its query and fragment.
The destination has no opener or referrer.
The fixed bundle on a page without NitroPack opens the link without invoking recovery.

Jest tests cover cancellation detection, link scoping, protocol rejection, replay suppression, and cleanup.
Browser verification remains necessary because JSDOM cannot produce trusted user input.

The automated [browser matrix](widget-browser-tests.md) now covers eight desktop and device profiles.
It checks native input, popup counts, exact destinations, security properties, and hint geometry.
Its behavioral Nitro fixture includes an unprotected control that reproduces the failure.
