# grok-icon-study

Unofficial study of a spring-driven character engine.  
非官方学习项目，与 xAI / Grok 无关。本仓库只开源机芯，不含角色几何、商标或第三方应用源码。

The **site** follows [bloub](https://github.com/jeremy-prt/bloub)’s presentation: a left rail, one character in the middle, Customise / Animations / Settings. The **motion** is ours — springs, 39 states, polygon eyes, overlays, login wrap. Not bloub’s measured 14-state engine.

## Running it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5191.

Clone the repo and the chrome still loads. Without `replica/geometry-data.js` the character stays off; the layout does not fall over. Put a file that matches [`replica/geometry.schema.md`](./replica/geometry.schema.md) at `replica/geometry-data.js` (gitignored) to see the bot.

The original lab is still there:

- [`replica/index.html`](./replica/index.html) — playground + HUD
- [`replica/showcase.html`](./replica/showcase.html) — recording layouts
- [`replica/embed.html`](./replica/embed.html) — `<grok-bot>`

Do not commit extracted geometry, icons, or a third-party app bundle.

## What's on the site

The rail switches three views. **Customise** is 18 body shapes, 11 inks and the rest-face playlist. **Animations** is bloub’s timeline editor on our 39 states: drag to reorder, pull a card to set duration, save named cycles in `localStorage`. The right-hand tiles append a block. **Settings** is language (French, English, Chinese) and credits. GIF/MP4 export is not in this tree.

The centre avatar is always `GrokCharacter` in `hold` mode. Tiles paint one frame and stop. Nothing from bloub’s `src/bot/` is in this tree.

## What the engine does

- 39 mood / lifecycle states, each with an eye playlist, blink cadence, gaze
- Springs on move, squash, spin, blink, shape change
- Eyes are polygon morphs, not sprites
- Some states switch overlays (thinking / orbit / writing / loading / …)
- Login wrap carries `pose.scale`, pointer follow, onboarding

Login-disk defaults: `sizePx: 64`, `color: "black"`, `shape: "blob"`.

## Layout

| Path | What |
|---|---|
| `src/` | Vue site (bloub-like chrome) |
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

## License

[MIT](./LICENSE) covers the original engine, site and docs in this repository.  
It does not grant rights to third-party character art, trademarks or application source; those are not in this repository.

Site chrome is arranged after bloub’s three-column scene. bloub is MIT; “Grok” and “x.ai” belong to their owners. Not affiliated with either.
