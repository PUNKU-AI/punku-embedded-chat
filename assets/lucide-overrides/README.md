# Hosted Lucide icon overrides

The icon builder applies these SVG files after the current and legacy Lucide sets.
Each filename must match an existing icon after normalization.
Normalization removes punctuation and converts letters to lowercase.
For example, `message-square-text.svg` replaces the hosted `messagesquaretext.svg` file.
The builder rejects unknown icons and duplicate normalized override names.

Overrides apply to every widget that loads the same hosted icon name.
They do not target one customer or one flow.
The builder keeps the original Lucide version and ISC notice in the output comment.
The published icon set includes the upstream ISC license.
Keep the source notice when changing an icon derived from Lucide.

The widget discards the source SVG root attributes.
It accepts basic shapes, geometry attributes, and child `fill` attributes.
It does not accept child `stroke`, `style`, `color`, or nested groups.
Older widget themes force white fills on header `path` elements.
Use permitted shapes such as `polygon` or `rect` when a fixed fill must remain visible.
Test replacements with the deployed widget bundle before publication.
The `MessageSquareText` replacement uses gray to support white and default dark strokes.
Custom text colors can match its fill and hide the text lines.

Run the focused builder tests with one worker:

```bash
node --test --test-concurrency=1 scripts/build-lucide-icons.test.cjs
```

Build the hosted icon set:

```bash
node scripts/build-lucide-icons.js
```

The existing `publish-icons.yml` workflow publishes this set without a widget bundle release.
It uploads the generated icons and invalidates their CloudFront cache paths.
Browser caches can retain an earlier SVG for up to 24 hours.
An open widget also caches each loaded icon for that page.
Check a fresh page after publication.
