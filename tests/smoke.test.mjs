/**
 * Headless smoke test: boots the whole client in jsdom with a stub canvas,
 * audio and network so we catch import errors, DOM id mismatches and
 * exceptions thrown from the game loop or the UI sheets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { performance as nodePerformance } from "node:perf_hooks";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function fakeContext() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
    setTransform() {},
    save() {},
    restore() {},
  };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      return () => {};
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  });
}

test("client boots, renders frames and opens every sheet", async () => {
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  virtualConsole.on("error", (...args) => errors.push(new Error(args.join(" "))));

  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), {
    url: "https://example.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  // canvas stub
  window.HTMLCanvasElement.prototype.getContext = () => fakeContext();
  window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAA";

  // minimal Web Audio stub
  class FakeParam {
    constructor() {
      this.value = 0;
    }
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    setTargetAtTime() {}
    cancelScheduledValues() {}
  }
  class FakeNode {
    constructor() {
      this.gain = new FakeParam();
      this.frequency = new FakeParam();
      this.detune = new FakeParam();
      this.Q = new FakeParam();
      this.threshold = new FakeParam();
      this.knee = new FakeParam();
      this.ratio = new FakeParam();
      this.playbackRate = new FakeParam();
    }
    connect() {
      return this;
    }
    disconnect() {}
    start() {}
    stop() {}
  }
  window.AudioContext = class {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = new FakeNode();
    }
    createGain() {
      return new FakeNode();
    }
    createOscillator() {
      return new FakeNode();
    }
    createBiquadFilter() {
      return new FakeNode();
    }
    createBufferSource() {
      return new FakeNode();
    }
    createDynamicsCompressor() {
      return new FakeNode();
    }
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    decodeAudioData() {
      return Promise.resolve({});
    }
    resume() {
      return Promise.resolve();
    }
  };

  // network stub
  const config = {
    ok: true,
    demoMode: true,
    startCoins: 250,
    assets: {
      backgrounds: [{ id: "auditorium", name: "Auditorium", url: "/assets/backgrounds/auditorium.png" }],
      faces: [{ id: "dean", name: "Dean", url: "/assets/faces/dean.png", scale: 1 }],
      dolls: [],
      voicePacks: [
        { id: "prof", name: "Prof Pack", language: "en", clips: { hit: ["/assets/voice/prof/hit-1.mp3"] } },
      ],
    },
  };
  const responses = {
    "/api/config": config,
    "/api/session": { ok: true, demo: true, player: { id: 0, name: "Guest" }, rank: null },
    "/api/score": { ok: true, accepted: false },
    "/api/leaderboard": { ok: true, rows: [{ place: 1, id: 7, name: "Someone", totalDamage: 10, bestRound: 10, bestCombo: 3 }] },
    "/api/stats": { ok: true, stats: { players: 1, damage: 10, kos: 0, rounds: 1 } },
  };
  window.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => responses[String(url).split("?")[0]] || { ok: true },
  });

  const raf = window.requestAnimationFrame.bind(window);
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Image: window.Image,
    AudioContext: window.AudioContext,
    requestAnimationFrame: raf,
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    performance: nodePerformance,
    PointerEvent: window.MouseEvent,
    Event: window.Event,
    fetch: window.fetch,
  };
  const previous = {};
  for (const [key, value] of Object.entries(globals)) {
    if (value === undefined) continue;
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }
  window.addEventListener("error", (event) => errors.push(event.error || new Error(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(event.reason));

  try {
    await import(pathToFileURL(path.join(root, "web/js/main.js")).href);
    // let boot() + a handful of render frames run
    await new Promise((resolve) => setTimeout(resolve, 700));

    const app = window.__KTP__;
    assert.ok(app, "app handle is exposed");
    assert.ok(app.game, "game instance exists");
    assert.equal(app.store.state.coins, 250);

    const game = app.game;
    const { x, y } = game.doll.basePosition;

    // attack a few times with different weapons
    for (const id of ["kick", "punch", "slap"]) {
      game.cooldowns[id] = 0;
      const hit = game.attack(id, x, y - 80);
      assert.equal(hit, true, `${id} should connect`);
    }
    assert.ok(game.hp < game.maxHp, "hp decreased");
    assert.ok(game.round.damage > 0, "damage recorded");
    assert.ok(game.store.state.coins > 250, "coins earned");

    // force a knockout and let the round-end path run
    game.hp = 1;
    game.cooldowns.kick = 0;
    game.attack("kick", x, y - 120);
    assert.equal(game.koActive, true, "KO started");
    await new Promise((resolve) => setTimeout(resolve, 3200));
    assert.equal(game.koActive, false, "round restarted after KO");
    assert.equal(game.hp, game.maxHp, "hp refilled");
    assert.ok(game.roundNumber >= 2, "round counter advanced");

    // every sheet builds without throwing
    for (const id of ["btnShop", "btnStudio", "btnSettings", "btnBoard"]) {
      const button = window.document.getElementById(id);
      assert.ok(button, `${id} exists`);
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(window.document.getElementById("modalRoot").hidden, false, `${id} opens the sheet`);
      assert.ok(window.document.getElementById("modalBody").children.length > 0, `${id} renders content`);
      app.closeModal();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    // resize path
    window.dispatchEvent(new window.Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 60));

    const fatal = errors.filter((error) => error && !/Not implemented: (HTMLCanvasElement|window\.scrollTo)/.test(String(error.message)));
    assert.deepEqual(fatal.map((error) => error.message), [], "no runtime errors");
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (!descriptor) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
    dom.window.close();
  }
});
