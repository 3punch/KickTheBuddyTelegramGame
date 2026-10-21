# Drop-in assets

Everything in this folder is scanned automatically at boot and exposed to the
game through `/api/config` (see `web/assets/manifest.json`). Drop a file in and
restart the server — no code changes needed.

```
web/assets/
├── backgrounds/   auditorium.jpg        → Studio ▸ Background
├── faces/         dean.png              → Studio ▸ Face   (PNG, transparent bg)
├── dolls/         buddy.png             → Studio ▸ Doll   (full body cut-out)
└── voice/<pack>/  hit-1.mp3, ouch-1.mp3 → Studio ▸ Voice  (voice pack)
```

Optional per-asset metadata: `<name>.json` next to the image.

Faces accept `scale`, `offsetX`, `offsetY`, `rotate`, `name`.
Dolls accept `height`, `pivotY`, `name`. Backgrounds accept `name`, `fit`, `dim`.
Voice packs accept `name`, `language`, `pitch`.

Full guide: [`docs/ASSETS.md`](../../docs/ASSETS.md)
