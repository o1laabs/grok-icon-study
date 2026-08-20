# grok-icon-study

Unofficial study of a spring-driven character engine.  
非官方学习项目，与 xAI / Grok 无关。本仓库只开源机芯，不含角色几何、商标或第三方应用源码。

One filled shape that morphs between **39 states**, **polygon eyes** that morph
on their own playlist, overlays on some states, springs on move / squash / blink /
spin. No animation library.

The **site** follows [bloub](https://github.com/jeremy-prt/bloub)’s presentation:
a left rail, one character in the middle, Customise / Animations / Settings.
The **motion** is ours — not bloub’s measured 14-state engine.

## Running it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5191.

```bash
pnpm build    # vue-tsc --noEmit && vite build
```

Vue 3, Vite, TypeScript, Tailwind 4. No ESLint and no Prettier: `vue-tsc` is the
only gate, so run `pnpm build` before you call something done.

Clone the repo and the chrome still loads. Without `replica/geometry-data.js`
the character stays off; the layout does not fall over. Put a file that matches
[`replica/geometry.schema.md`](./replica/geometry.schema.md) at
`replica/geometry-data.js` (gitignored) to see the bot.

Do not commit extracted geometry, icons, or a third-party app bundle.

## What's on the site

The rail on the left switches between three views. **Customise** offers 8 body
shapes, 11 inks and 17 rest expressions, kept between visits, plus a manual pose
overlay (drag the body, tune an eye). **Animations** is bloub’s timeline editor
on our 39 states: drag to reorder, pull a card to set duration, save named
cycles in `localStorage`. The right-hand tiles append a block. **Settings**
holds the language (Chinese or English, Chinese by default) and the credits.

Anything on screen can be exported: the avatar as PNG, SVG or an animated GIF,
and a whole timeline as GIF or MP4. The still formats need no library at all,
and the video encoder is only fetched the first time you ask for one.

The centre avatar is always `GrokCharacter` in `hold` mode. Tiles paint one
frame and stop. Nothing from bloub’s `src/bot/` is in this tree.

Three URLs are worth knowing:

- [`replica/index.html`](./replica/index.html) — playground + HUD
- [`replica/showcase.html`](./replica/showcase.html) — recording layouts
- [`replica/embed.html`](./replica/embed.html) — `<grok-bot>`

## Why this isn't bloub

bloub measured 14 states off a video and plays exponential ease-outs with no
overshoot. This repo studies the spring-driven character: 39 states, polygon
eyes, overlays, login wrap. Rounding a spring or swapping a playlist changes
the feel, which is the thing this project is trying to keep.

Geometry is not in the tree on purpose. The engine runs against
`window.GROK_GEO`; without it the site still stands.

## What the engine does

- 39 mood / lifecycle states, each with an eye playlist, blink cadence, gaze
- Springs on move, squash, spin, blink, shape change
- Eyes are polygon morphs, not sprites
- Some states switch overlays (thinking / orbit / writing / loading / …)
- Login wrap carries `pose.scale`, pointer follow, onboarding

Login-disk defaults: `sizePx: 64`, `color: "black"`, `shape: "blob"`.

## How it's put together

`replica/src/` is framework-free. `GrokCharacter` owns the clock; Vue only
mounts it, paints tiles, and (in Customise) overlays the pose editor. Missing
geometry keeps the chrome. `GROK.create` / `<grok-bot>` live in
`replica/src/api.js`.

| Path | What |
|---|---|
| `src/` | Vue site (bloub-like chrome) |
| `src/ui/pose/` | manual pose, head surfaces |
| `replica/index.html` | playground |
| `replica/geometry.schema.md` | `window.GROK_GEO` contract, no data |
| `replica/src/math.js` | springs, lerp, polygons |
| `replica/src/tables.js` | states, playlists, spring constants |
| `replica/src/pose.js` | pose / gaze |
| `replica/src/tricks.js` | spin, hop |
| `replica/src/fx.js` | overlays and particles |
| `replica/src/eyes.js` | blink, wink, eye paint |
| `replica/src/character.js` | `GrokCharacter` |
| `replica/src/api.js` | `GROK.create` / `<grok-bot>` |

This repo deliberately does not contain:

- character geometry (`geometry-data.js`)
- official icons / iconset
- unpacked app slices
- unpack scripts

## Using the component

```vue
<Hero state="idle" shape="blob" color="black" :size="120" />
```

```html
<grok-bot state="idle" shape="blob" color="black" size="64"></grok-bot>
```

```js
const { setState, setShape, setColor, setPaused, spin, bounce, destroy } = GROK.create("#host", {
  sizePx: 64,
  shape: "blob",
  color: "black",
  loginWrap: true,
  mode: "hold",
});
```

`GROK.create` / `GrokCharacter` default to `mode: "hold"` and will not cycle on
their own. Pass `mode: "onboarding"` for the login beat. Public methods:
`setState` `setShape` `setColor` `setPaused` `spin` `bounce` `destroy`.
`<grok-bot>` attributes: `state` `shape` `color` `size` `paused`
`follow="true"` `mode` `emphasis`.

See [`src/components/Hero.vue`](src/components/Hero.vue) and
[`replica/src/api.js`](replica/src/api.js) for the details.

## License

[MIT](./LICENSE) covers the original engine, site and docs in this repository.  
It does not grant rights to third-party character art, trademarks or application source; those are not in this repository.

Site chrome is arranged after bloub’s three-column scene. bloub is MIT; “Grok”
and “x.ai” belong to their owners. Not affiliated with either.
