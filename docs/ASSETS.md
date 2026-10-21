# Customising the Professor

Everything visual and audible in the game is swappable. There are two layers:

1. **Per-player (in the game)** — *Studio* sheet. Changes live on the player's
   device only (localStorage for images, IndexedDB for recordings).
2. **Global (in the repo)** — drop files into `web/assets/`. They show up for
   everyone in the Studio and are served by the game server.

```
web/assets/
├── backgrounds/   ← stage images
├── faces/         ← head/face photos
├── dolls/         ← full-body replacements
└── voice/
    └── <pack>/    ← voice packs (folders)
```

After adding/removing files run `npm run assets` (or restart the server) to
rebuild `web/assets/manifest.json`. The manifest is fetched by the client at
`/api/config`.

---

## Backgrounds

| | |
| --- | --- |
| Location | `web/assets/backgrounds/` |
| Formats | `.jpg`, `.png`, `.webp`, `.avif` |
| Suggested size | 1080 × 1920 (portrait), or square — it is cover-fitted |
| Metadata | optional `<id>.json` |

```json
// web/assets/backgrounds/auditorium.json
{ "name": "Lecture Hall", "fit": "cover", "dim": 0.1 }
```

The stage is drawn edge-to-edge behind the character, with a vignette and a
floor shadow so the doll stays grounded. Avoid busy detail in the centre.

---

## Faces

| | |
| --- | --- |
| Location | `web/assets/faces/` |
| Formats | `.png` **with transparency** (best), `.webp`, `.jpg`, `.svg` |
| Suggested size | 512 × 512, face centred, eyes about 45 % from the top |
| Metadata | optional `<id>.json` |

```json
// web/assets/faces/dean.json
{ "name": "Dean Strictly", "scale": 1.02, "offsetX": 0, "offsetY": 0.02, "rotate": 0 }
```

* `scale` — zoom the photo inside the head (1 = fills the head exactly, >1 crops in).
* `offsetX` / `offsetY` — shift in fractions of the head radius.
* `rotate` — radians.
* `round` — set `false` for a non-elliptical mask.

The face is clipped to the head ellipse and receives a soft inner vignette so
photos blend with the cartoon body. Glasses, moustache and blinking eyes are
skipped automatically; expressions come from the body/limbs and the stun stars.

A bundled example lives at `web/assets/faces/dean.svg`.

---

## Dolls (full-body replacement)

| | |
| --- | --- |
| Location | `web/assets/dolls/` |
| Formats | `.png` with transparency |
| Suggested size | 600 × 1100 (roughly 1:1.8) |
| Metadata | optional `<id>.json` |

```json
// web/assets/dolls/buddy.json
{ "name": "Buddy", "height": 520, "pivotY": 0.5 }
```

`height` is expressed in the doll's internal units (the drawn professor is ~520),
`pivotY` is where the image pivots (0.5 = centre). When a doll image is set the
articulated body is hidden but the physics still applies — knockback, squash,
K.O. tumble and shadows all keep working.

---

## Voice packs

A voice pack is a folder inside `web/assets/voice/`:

```
web/assets/voice/
├── professor-angry/
│   ├── hit-1.mp3
│   ├── hit-2.mp3
│   ├── ouch-1.mp3
│   ├── ko-1.mp3
│   ├── taunt-1.mp3
│   ├── special-1.mp3
│   └── coin-1.mp3
└── professor-angry.json
```

```json
{ "name": "Angry Professor", "language": "en", "pitch": 1 }
```

**Event prefixes** (the part before `-` or `_`):

| Prefix | When it plays |
| --- | --- |
| `hit` | on every connecting hit |
| `ouch` | complaints / pain reactions |
| `ko` | when he goes down |
| `taunt` | idle banter between attacks |
| `special` | heavy weapons (pan, taser, chalk bomb) |
| `coin` | coin pickups |

You can put as many numbered variants as you like (`hit-1`, `hit-2`, …) — one is
picked at random. Keep clips short (0.4–2 s), mono, 64–96 kbps MP3/OGG to stay
light on mobile data.

### Recording your own voice in-game

Studio ▸ Voice ▸ *My recordings* → **Record** on any event, speak (max 3.2 s),
**Stop**. The clip is stored in IndexedDB and the game switches to your
recordings automatically. **▶ Test** previews the currently selected voice.

> Recording needs `https://` (or `localhost`) — browsers block the microphone
> on plain HTTP origins. Inside Telegram the Mini App is always HTTPS.

---

## Tuning gameplay numbers

`web/js/content.js` is the single source of truth:

* `WEAPONS` — damage, cooldown, price, knockback, stun, sound, localised names.
* `UPGRADES` — max level, base cost and growth curve.
* `BUILTIN_VOICES` — pitch/rate presets for the synth voices.
* `coinReward(damage, coinBonusLevel, koBonus)` — payout formula.

Emoji art is used for weapon icons and swing effects, so adding a weapon is a
five-line change. New weapons automatically appear in the Shop, the dock and the
keyboard shortcuts (`1…9`).
