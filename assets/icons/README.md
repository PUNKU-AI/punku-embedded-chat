# Custom Icons

This folder hosts custom icons for clients using the punku-chat widget.

Files committed here are served via jsDelivr CDN automatically:

```
https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@main/assets/icons/<filename>
```

## Usage

In the embed snippet, use `header_icon` (not `header_icon_name`):

```html
<punku-chat
  header_icon="https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@main/assets/icons/<filename>"
  ...
></punku-chat>
```

## Naming convention

`<client-slug>.<ext>` — e.g. `tanzbar.svg`, `hotel-mirabell.png`

## Files

| File | Client | Format |
|------|--------|--------|
| `tanzbar.svg` | Tanzbar (Tiroler Abend) | SVG (embedded JPEG) |
