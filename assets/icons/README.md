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
| `tressbrueder-logo-green.svg` | TressBrüder | SVG, green `#3aaa35` |

The TressBrüder file preserves the original logo geometry.
It changes only the fill from `#fdfcf5` to `#3aaa35`.
Embeds with `header_icon` can use this file directly.
For fixed embeds, the widget can read optional header image overrides.
Each override matches the backend origin, flow ID, and page origin through a SHA-256 selector.
An explicit `header_icon` always takes priority.
Configuration or image failures preserve the existing icon.
The override configuration requires separate CDN publication.
Adding this asset alone does not change existing embeds or shared icons.
