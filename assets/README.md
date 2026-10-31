# Application icon

`icon.svg` is the editable vector master, matching the manual's folded-map and
location-marker branding. Its transparent corners suit light and dark desktops.

`icons/` contains RGBA PNGs at 16, 24, 32, 48, 64, 128, 256, 512 and 1024 pixels.
`icon.ico` contains the same 16–256 pixel images as seven PNG-compressed frames.
Windows embeds this ICO into the actual application executable. The native
window uses the same artwork; Linux packages install matching hicolor icons and
a scalable SVG, referenced by the application desktop entry.

These are project assets covered by the repository's AGPLv3 license. Changes to
the vector master should be rendered at every listed size and packed into the
ICO before running `node scripts/verify-icons.mjs`. Package verification also
checks that the installed desktop icons and embedded Windows resources match.
