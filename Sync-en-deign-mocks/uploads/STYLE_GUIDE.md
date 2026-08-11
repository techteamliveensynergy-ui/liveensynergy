# The Raising Club — CSS & Theme Reference

A complete map of how the app is styled. There is **no per-section stylesheet** —
the whole app is styled with **Tailwind CSS v4** utility classes drawing from one
brand token set defined in [`src/app/globals.css`](../src/app/globals.css). Each
product area (marketplace, events, courses, …) gets its own "theme" by leaning on
a **signature accent** from that shared palette, plus a handful of fine-tuned
arbitrary hex shades for badges and category chips.

- **Framework:** Tailwind v4 (`@import "tailwindcss"`, `@theme inline` tokens), PostCSS (`@tailwindcss/postcss`).
- **Single global stylesheet:** `src/app/globals.css` (imported once in `src/app/[locale]/layout.tsx`).
- **No dark mode**, no CSS-in-JS, no CSS modules. Theming = utility classes.
- **Design origin:** palette extracted from the Figma landing page *"Web design the Raising Club"*.

---

## 1. Foundation — brand tokens

All tokens live in `globals.css`. `:root` holds the two semantic base variables;
`@theme inline` registers the full palette so Tailwind generates `bg-*`, `text-*`,
`border-*`, `ring-*`, `fill-*`, `stroke-*` utilities for each.

```css
:root {
  --background: #fcf7f0; /* cream */
  --foreground: #504644; /* warm charcoal ink */
}

@theme inline {
  /* base (semantic) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  /* brand */
  --color-cream:        #fcf7f0; /* app background, cards on tinted bands */
  --color-ink:          #504644; /* primary text (warm charcoal) */
  --color-ink-soft:     #6f6360; /* secondary / muted text */

  --color-primary:       #ed9a4e; /* CTA orange */
  --color-primary-hover: #e08a39; /* CTA orange, hover */
  --color-primary-soft:  #f1ae6e; /* lighter accent orange */

  --color-lavender: #edebf2; /* events tint */
  --color-purple:   #baaae1; /* events accent */
  --color-olive:    #c0cf72; /* marketplace accent */
  --color-yellow:   #f6e092; /* onboarding / membership accent */
  --color-sage:     #dee2c6; /* soft green tint */
  --color-mint:     #ecf3f2; /* cool card tint */
  --color-pink:     #ffecf1; /* soft warm tint */

  /* fonts (wired in layout.tsx) */
  --font-sans:    var(--font-albert-sans); /* body / paragraphs */
  --font-display: var(--font-dm-sans);     /* headings + UI */
  --font-serif:   var(--font-playfair);    /* elegant accents */
}
```

### Palette swatches

| Token | Hex | Role |
|---|---|---|
| `cream` | `#fcf7f0` | App background; card fill on tinted bands |
| `ink` | `#504644` | Primary text |
| `ink-soft` | `#6f6360` | Secondary / muted text |
| `primary` | `#ed9a4e` | Primary CTA orange |
| `primary-hover` | `#e08a39` | CTA hover |
| `primary-soft` | `#f1ae6e` | Lighter accent orange |
| `lavender` | `#edebf2` | Events surface tint |
| `purple` | `#baaae1` | Events accent |
| `olive` | `#c0cf72` | Marketplace accent |
| `yellow` | `#f6e092` | Onboarding / membership accent |
| `sage` | `#dee2c6` | Soft green tint |
| `mint` | `#ecf3f2` | Cool card tint |
| `pink` | `#ffecf1` | Soft warm tint |

> **Opacity modifiers everywhere.** The design leans heavily on Tailwind's
> `/NN` alpha syntax to make one token do many jobs — e.g. `text-ink/75`,
> `border-ink/15`, `border-ink/10`, `bg-primary/10`, `bg-olive/20`,
> `bg-cream/40`. Hairline borders are almost always `border-ink/10` or
> `border-ink/15`; muted body copy is `text-ink-soft` or `text-ink/70`.

---

## 2. Typography

Three Google fonts, loaded via `next/font/google` in
`src/app/[locale]/layout.tsx` and exposed as CSS variables on `<html>`:

| CSS var | Font | Weights | Used for |
|---|---|---|---|
| `--font-albert-sans` → `--font-sans` | **Albert Sans** | 300–700 | Body, paragraphs (default `body` font) |
| `--font-dm-sans` → `--font-display` | **DM Sans** | 400–700 | Headings (`h1–h4`) + UI, via `.font-display` |
| `--font-playfair` → `--font-serif` | **Playfair Display** | 400–700, incl. italic | Elegant serif accents, via `.font-serif` |

Base rules from `globals.css`:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, .font-display {
  font-family: var(--font-display), var(--font-sans), system-ui, sans-serif;
}
.font-serif { font-family: var(--font-serif), Georgia, serif; }
```

The font variables are attached in the root layout:

```tsx
<html className={`${dmSans.variable} ${playfair.variable} ${albertSans.variable} h-full antialiased`}>
  <body className="min-h-full flex flex-col bg-cream text-ink">
```

---

## 3. Global base styles

```css
* { border-color: #00000010; }   /* default hairline for any bordered element */
html { scroll-behavior: smooth; }
```

- Every element defaults to a **6.25%-black hairline border color**, so adding
  `border` alone yields a subtle divider without picking a color.
- Smooth scrolling is global.

---

## 4. Shape & elevation system

Consistent across the whole app (counts are approximate usage across `src/components`):

| Utility | Usage | Meaning |
|---|---|---|
| `rounded-full` | ~330× | Pills: buttons, badges, chips, avatars, toggles |
| `rounded-2xl` | ~117× | **Default card / image radius** |
| `rounded-xl` | ~103× | Inputs, smaller cards, inner panels |
| `rounded-lg` | ~95× | Compact controls, list rows |
| `rounded-3xl` | ~19× | Large feature cards (e.g. event cards) |
| `shadow-sm` | ~76× | **Default resting card elevation** |
| `shadow-md` | ~5× (+ hover) | Hover-raise on cards (`hover:shadow-md`) |
| `shadow-xl` / `shadow-2xl` | ~11× / ~5× | Modals, drawers, floating panels |

**Elevation idiom:** cards rest at `shadow-sm` and raise on hover:
`transition hover:shadow-md`.

---

## 5. Shared component patterns

These recur verbatim across sections — treat them as the de-facto component library.

### Primary CTA button
```html
<button class="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5
               text-sm font-semibold text-white hover:bg-primary/90
               disabled:opacity-60">
```
Compact variant: `px-4 py-2` + `gap-1.5`. Hover is `bg-primary/90` (some places
use the `bg-primary-hover` token instead).

### Secondary / outline button
```html
<button class="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold
               text-ink hover:bg-ink/5">
```

### Card shell (default)
```html
<div class="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm
            transition hover:shadow-md">
```
Sticky side panels add `lg:sticky lg:top-20`. Tinted cards swap `bg-white` for a
section tint (`bg-mint/60`, `bg-lavender`, `bg-cream`, …).

### Badge / chip / pill
```html
<span class="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink
             backdrop-blur">
<!-- accent variant -->
<span class="rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-white">
```

### Inputs
Typically `rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm` with focus
`focus:ring-2 focus:ring-primary` (or the section accent).

### Surface tints
Section pages wrap content in `min-h-screen bg-cream`; tinted bands use the
section accent at low alpha (`bg-lavender`, `bg-sage/50`, `bg-olive/10`, etc.).
Gradients are essentially unused — the design is **flat pastel fills**, not
gradients (only a single `bg-gradient-to-b` appears anywhere).

---

## 6. App chrome (global frame)

`src/components/app/` renders the persistent sidebar/frame around every logged-in
page. It is deliberately **neutral** so section accents read against it:

- Text: `text-ink`, `text-ink-soft`
- Active/solid elements: `bg-ink`
- Dividers: `border-ink/5`
- Frame background inherits `bg-cream` from `<body>`.

---

## 7. Per-section themes

Each area keeps the neutral base (`cream` bg, `ink`/`ink-soft` text, `ink/10–15`
borders) and layers **one signature accent**. Below: the accent, the actual
tokens/hex used, and the character of each area. Arbitrary `#hex` values are the
finer, hand-tuned shades used mainly for category chips and status badges.

### 🫒 Marketplace — **Olive / green**
Signature: `olive`. The most olive-forward area in the app.
- Core: `border-olive`, `text-olive`, `bg-olive` (+ `/10 /15 /20`), `bg-cream`.
- Secondary tints: `bg-sage/40–50`, `bg-mint` / `bg-mint/60`, `bg-primary/15`.
- Fine shades: blue accents `#4a6b9a` / `#2a4a7a` / `#dce6f0` (info/verified),
  green fills `#dcebc6` / `#4f6b15`, pink `#ed6a8a` (favourite/heart).
- Feel: earthy, trustworthy, olive chips on cream cards with `border-ink/15`.

### 🗓️ Events — **Lavender / purple** (with green category chips)
Signature: `lavender` surface, `purple` accent.
- Core: `bg-lavender` (card image wells), `border-[#baaae1]` (= `purple`),
  `text-[#8b76c2]` (purple text), `bg-pink`, `bg-cream/40–50`.
- Event card shell is distinctive: `rounded-3xl border border-black/5
  bg-[#f2f0f6] p-3 shadow-sm hover:shadow-md` with a `bg-lavender` image well.
- Category/price chips use a **green family**: `bg-[#9cc766]` / `#8bb957` /
  `#7ba84f` / `#6f9a3f`, warm `#fdf2e2` / `#a05014`, rose `#a02c4a`.
- Feel: playful, colourful — the most multi-colour section (lavender frame +
  green/orange/rose chips).

### 🎓 Courses — **Primary orange**
Signature: `primary`. The most brand-orange area.
- Core: `bg-primary` (+ `/5 /10 /90`), `text-primary`, `border-primary`,
  `bg-cream` (+ `/30`), `bg-lavender`, `bg-olive/10`, `text-olive`.
- Fine shades: warm creams/tans `#fcf6ec` / `#fbe9d6` / `#f7ecdd` / `#efdcc4`,
  greens `#4f6b15` / `#5f8a36` / `#eef6e3` (pass/progress), rose `#a02c4a`.
- Feel: warm and encouraging; orange buttons and progress accents on cream.

### 🏠 Home / Dashboard — **Orange on cream, multi-accent tiles**
- Home: `bg-cream`, `text-primary`, subtle `bg-sage/50`, `bg-pink`, `bg-mint`,
  `bg-lavender` tiles — one of each pastel as a "welcome" quilt.
- Dashboard: neutral `ink` structure with rotating accent tiles —
  `#faf5ee`, `#f3ead6`, `#fbeadd`, `#ece9f5`, `#e6ecd6` (one pastel per widget),
  plus `bg-olive`, `bg-sage`, `bg-yellow`, `ring-yellow/70`, `text-purple`.

### 🌱 Onboarding — **Yellow + olive**
Signature: `yellow`.
- Core: `bg-yellow` (+ `/25`), `border-yellow`, `bg-olive`, `ring-primary` /
  `ring-olive` selection rings, `border-ink/25` option cards, warm `#faf1e4`.
- Feel: bright, selectable option cards with ring highlights.

### 💳 Membership — **Lavender + yellow (premium)**
- Core: `bg-lavender`, `bg-yellow` + `fill-yellow` (stars/ratings), `text-primary`,
  warm cards `#faf1e4`, borders `#f0e3d2` / `#e9c79a`, `bg-[#f5dab6]`.
- Feel: soft premium — lavender panels with gold/yellow accents.

### ℹ️ About — **Yellow + primary, pastel bands**
- Core: `bg-cream`, `bg-yellow`, `text-primary`, `bg-sage`, `text-sage`,
  `bg-pink`, `bg-lavender/50`, `bg-primary-soft/35`, plus `#f6edcb` / `#cfe2e6`.
- Feel: editorial, alternating pastel content bands.

### 🛠️ Admin — **Neutral ink (utilitarian)**
- Almost pure `ink` / `ink-soft` with `border-ink/5–15`, `bg-ink/5–15`,
  `bg-cream/40`; `bg-primary` reserved for primary actions only.
- Feel: dense, calm, monochrome — accents used sparingly for action/status.

### Quick section → accent cheatsheet

| Section | Signature accent | Surface tint | Notable secondary |
|---|---|---|---|
| Marketplace | `olive` | `cream` | `sage`, `mint`, blue `#4a6b9a` |
| Events | `purple` / `lavender` | `lavender` / `#f2f0f6` | green chips `#9cc766` |
| Courses | `primary` (orange) | `cream` | warm tans, `olive` |
| Home | `primary` | `cream` | all pastels (quilt) |
| Dashboard | `ink` + rotating pastels | `cream` | per-tile pastel |
| Onboarding | `yellow` | `cream` | `olive`, ring accents |
| Membership | `lavender` + `yellow` | `lavender` | gold borders |
| About | `yellow` + `primary` | `cream` | `sage`, `pink`, `lavender` |
| Admin | `ink` (neutral) | `cream` | `primary` for actions |

---

## 8. Decorative CSS & SVG motifs

### Postage-stamp scalloped edge — `.stamp-edge`
Cuts semicircular notches along all four sides using four intersected radial-gradient
masks (used on the manifesto "stamp" panel).
```css
.stamp-edge {
  --stamp-r: 12px;   /* notch radius */
  --stamp-sp: 26px;  /* notch spacing */
  -webkit-mask: /* 4 radial gradients, one per edge */ … ;
  -webkit-mask-composite: source-in;
  mask: … ;
  mask-composite: intersect; /* hide a pixel if ANY edge mask removes it */
}
```

### Cloud / washi-tape banner — `.cloud-banner`
A solid panel whose top and bottom edges are a row of soft outward bumps (the cream
quote banner on the sage band). Two bump strips + a centre fill, unioned:
```css
.cloud-banner {
  --cb-b: 13px;    /* bump size */
  --cb-tile: 30px; /* bump tile width */
  mask:
    radial-gradient(var(--cb-b) at 50% 100%, #000 98%, #0000) top / var(--cb-tile) var(--cb-b) repeat-x,
    radial-gradient(var(--cb-b) at 50% 0,    #000 98%, #0000) bottom / var(--cb-tile) var(--cb-b) repeat-x,
    linear-gradient(#000 0 0) center / 100% calc(100% - 2 * var(--cb-b)) no-repeat;
}
```

### Pastel SVG shapes — `src/components/landing/decorations.tsx`
Reusable inline SVGs scattered through the landing page, each accepting a `color` prop:
- **`<Flower>`** — 5 ellipse petals + yellow centre. Default petal `#FFD7E4`, centre `#FBE7A1`.
- **`<Leaf>`** — single leaf path with a translucent white vein. Default `#C0CF72` (olive).
- **`<Blob>`** — organic rounded blob. Default `#F1AE6E` (primary-soft).

---

## 9. How to extend the theme

1. **Add a colour:** add `--color-<name>: #hex;` inside `@theme inline` in
   `globals.css`. Tailwind auto-generates `bg-<name>`, `text-<name>`, etc.
2. **Theme a new section:** keep the neutral base (`bg-cream`, `text-ink`,
   `border-ink/10`) and pick **one** signature accent token; use `/NN` alpha
   variants for tints rather than new hex values where possible.
3. **New CTA:** reuse the primary-button pattern (§5); only the accent token changes.
4. **New decorative edge:** follow the `.stamp-edge` / `.cloud-banner` mask
   pattern rather than background images, so it stays resolution-independent.
5. Prefer **tokens + alpha** over arbitrary `#hex`; reserve arbitrary hex for
   the fine category/status shades that don't warrant a global token.

---

### File map

| Concern | Location |
|---|---|
| Tokens, fonts, base styles, decorative classes | `src/app/globals.css` |
| Font loading + `<html>`/`<body>` base classes | `src/app/[locale]/layout.tsx` |
| Tailwind/PostCSS wiring | `postcss.config.mjs` (`@tailwindcss/postcss`) |
| App chrome / sidebar | `src/components/app/` |
| Decorative SVG shapes | `src/components/landing/decorations.tsx` |
| Section styling | utility classes inline in each `src/components/<section>/` |
