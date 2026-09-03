# SEO Buddy logo

The owner supplied `Logo redesign with scoring theme.zip` on September 3, 2026.
The shipped artwork is copied unchanged from that package:

| App asset | Supplied source | Use |
| --- | --- | --- |
| `public/sb-mark.svg` | `svg/mark-light.svg` | Light navigation |
| `public/sb-mark-dark.svg` | `svg/mark-dark.svg` | Dark navigation |
| `public/sb-favicon.svg` | `svg/mark-thin-favicon.svg` | Scalable browser icon |
| `public/sb-mark.png` | `png/favicon-32.png` | 32px browser icon fallback |
| `public/sb-touch-180.png` | `png/app-icon-180.png` | Home-screen shortcut |

Both navigation variants render at 40px, above the supplied 32px minimum.
CSS selects the complete variant using the existing app theme; it does not
filter, recolor, rotate, or animate the mark. The adjacent accessible product
name retains the app's typography. The supplied horizontal lockups are not used:
their SVG viewport clips the ring, and their text depends on additional fonts.
Best Day Fitness's business badge and report branding remain separate.

The asset URLs carry a branding revision query so existing browsers request the
replacement artwork. Bump that revision in the HTML and its integration test
when replacing these files again. An already-saved phone shortcut may need to
be recreated because the operating system caches its icon separately.
