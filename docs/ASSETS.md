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
| Formats | `.png` with transparency (the flat-background keyer handles JPEGs) |
| Suggested size | anything portrait; 645 × 900 is what the bundled plush uses |
| Metadata | `<id>.json` (recommended) |

```json
// web/assets/dolls/professor-plush.json
{
  "name": "Professor Plush",
  "height": 0.6,          // fraction of the screen height (<= 2), or legacy px units
  "tip": 0.92,            // how much the body rotates when hit / knocked out
  "avatar": "professor-head"   // face id used for the HUD avatar bubble
}
```

The **default character is `professor-plush`** — a cut-out body that stands
feet-on-floor, tips over like a cardboard cut-out on a K.O. and keeps the
hit-shapes aligned with the artwork (head, torso, arms, legs are all hittable).
Set `"doll": ""` in a save/Studio to fall back to the drawn professor.

`height ≤ 2` is read as a fraction of the canvas height; larger numbers are the
legacy design units (the drawn professor is ~520). When a doll image is active,
the articulated body is hidden but the physics still applies — knockback, squash,
screen shake, tumble and shadows all keep working.

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

### Adding a weapon

Weapons are canvas actors ("rigs"), not images. A weapon entry looks like this:

```js
{
  id: "fish", name: "Wet fish", emoji: "🐟",
  rig: "fish",                 // drawing function in web/js/weaponry.js
  motion: "swing",             // swing | thrust | drop | toss | projectile | sweep
  swing: 430,                  // animation length in ms (damage lands at the end)
  hits: [{ at: 0.7, mult: 1 }],// multiple timed hits per swing (chainsaw = 3)
  contact: [-16, 0],           // point of the rig that touches the target
  fallRot: -0.95,              // only for "drop": fixed orientation while falling
  damage: 230, cooldown: 520, price: 2400, knock: 1.2, stun: 0,
  style: "slap",               // palette for the impact particles
  sound: "smack", names: { ar: "سمكة مبللة", de: "Nasser Fisch", es: "Pescado mojado" },
}
```

* To draw a new weapon, add a function to `RIGS` in `web/js/weaponry.js`. Author
  it so the striking end sits near `(0, 0)` with the handle along `+x`; the
  attacker rotates and positions it automatically.
* `web/js/attacker.js` holds the motion profiles (`swing`, `thrust`, `drop`,
  `toss`, `projectile`, `sweep`) — keyframed distance, rotation, scale and alpha.
* Dock and shop icons are rasterised from the rig at runtime, so a new weapon
  needs no image assets.
* `node scripts/render-weapons.mjs` renders the full sheet plus mid-swing frames
  to `tmp/` for review.
