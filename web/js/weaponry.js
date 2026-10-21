/* Weapon rigs — hand-drawn canvas actors for every weapon.
 *
 * Each rig is drawn in a normalised space where the *striking end* sits at
 * (0, 0) and the arm / handle trails along +x. The attacker then rotates and
 * moves that space so the business end lands exactly on the hit point.
 */

const INK = "#241a15";
const SKIN = "#f7c9a3";
const SKIN_DARK = "#e2a97e";
const COAT = "#f6f9ff";
const STEEL = "#c9d2e2";
const STEEL_DARK = "#8b97ad";
const WOOD = "#c98a4b";
const WOOD_DARK = "#9a6330";

const TAU = Math.PI * 2;

export function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillStroke(ctx, fill, lw = 3.4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/** Fleshy forearm + lab-coat sleeve trailing to the right. */
function arm(ctx, { from = 34, to = 118, w = 26, color = SKIN, sleeve = true } = {}) {
  rr(ctx, from, -w / 2, to - from, w, w * 0.45);
  fillStroke(ctx, color);
  // wrist crease
  ctx.strokeStyle = "rgba(140,90,58,0.35)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(from + 8, -w * 0.16);
  ctx.lineTo(from + 8, w * 0.16);
  ctx.stroke();
  if (sleeve) {
    rr(ctx, to - 26, -w / 2 - 3, 32, w + 6, 7);
    fillStroke(ctx, COAT);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(to - 20, -w / 2 + 2);
    ctx.lineTo(to - 20, w / 2 - 2);
    ctx.stroke();
  }
}

function knuckles(ctx, x, y, r) {
  ctx.strokeStyle = "rgba(150,95,60,0.45)";
  ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, y + i * r * 0.34);
    ctx.lineTo(x + r * 0.42, y + i * r * 0.34);
    ctx.stroke();
  }
}

/* ── hand-to-hand ──────────────────────────────────────────────────────── */

function fistGrip(ctx, { glove = false } = {}) {
  arm(ctx, { from: 40, to: 128, w: 28 });

  if (glove) {
    rr(ctx, 22, -25, 24, 50, 11);
    fillStroke(ctx, "#eef2fa");
    ctx.beginPath();
    ctx.moveTo(26, -30);
    ctx.quadraticCurveTo(-12, -38, -34, -15);
    ctx.quadraticCurveTo(-48, 0, -34, 15);
    ctx.quadraticCurveTo(-12, 38, 26, 30);
    ctx.closePath();
    fillStroke(ctx, "#e0453f");
    ctx.strokeStyle = "rgba(110,15,8,0.45)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, -24);
    ctx.quadraticCurveTo(-2, 0, -12, 24);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, -14);
    ctx.quadraticCurveTo(-36, 0, -26, 14);
    ctx.stroke();
    circle(ctx, -2, 22, 11);
    fillStroke(ctx, "#c93a35");
    return;
  }

  // forearm cuff
  rr(ctx, 26, -16, 20, 32, 9);
  fillStroke(ctx, SKIN_DARK, 3);

  // the fist itself — rounded block, knuckles facing the target
  rr(ctx, -30, -23, 62, 46, 17);
  fillStroke(ctx, SKIN);

  // four curled fingers stacked on the striking face
  for (let i = 0; i < 4; i += 1) {
    const y = -16.5 + i * 11;
    ctx.beginPath();
    ctx.ellipse(-24, y, 10, 6.6, 0, 0, TAU);
    fillStroke(ctx, i % 2 === 0 ? SKIN : "#f2c09a", 2.2);
  }

  // thumb folded over the top of the fingers
  rr(ctx, -24, -22, 34, 15, 7.5);
  fillStroke(ctx, SKIN_DARK, 2.6);

  // wrist crease
  ctx.strokeStyle = "rgba(150,95,60,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, -14);
  ctx.quadraticCurveTo(24, 0, 20, 14);
  ctx.stroke();
}

const RIGS = {
  /* bare fist */
  fist(ctx) {
    fistGrip(ctx);
  },

  /* boxing glove — heavy, red leather */
  glove(ctx) {
    fistGrip(ctx, { glove: true });
  },

  /* kicking leg with a big shoe */
  leg(ctx) {
    // trouser leg
    rr(ctx, 34, -22, 96, 44, 16);
    fillStroke(ctx, "#39415f");
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, -20);
    ctx.lineTo(96, 20);
    ctx.stroke();
    // sock
    rr(ctx, 20, -19, 26, 38, 10);
    fillStroke(ctx, "#eef1f8");
    // shoe
    ctx.beginPath();
    ctx.moveTo(24, -20);
    ctx.quadraticCurveTo(-6, -26, -18, -12);
    ctx.quadraticCurveTo(-30, 2, -16, 12);
    ctx.quadraticCurveTo(0, 24, 26, 20);
    ctx.closePath();
    fillStroke(ctx, "#4b3327");
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, -16);
    ctx.quadraticCurveTo(-18, -6, -12, 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // laces
    ctx.strokeStyle = "#e8dccb";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 7, -12);
      ctx.lineTo(10 + i * 7, 8);
      ctx.stroke();
    }
  },

  /* open palm for a slap */
  hand(ctx) {
    arm(ctx, { from: 40, to: 122, w: 24 });
    // palm
    rr(ctx, 2, -24, 44, 48, 14);
    fillStroke(ctx, SKIN);
    // fingers
    for (let i = 0; i < 4; i += 1) {
      const y = -20 + i * 13;
      rr(ctx, -16, y - 5.5, 26, 11, 5.5);
      fillStroke(ctx, SKIN);
    }
    // thumb
    rr(ctx, 18, 20, 24, 12, 6);
    fillStroke(ctx, SKIN_DARK);
  },

  /* flip-flop */
  sole(ctx) {
    arm(ctx, { from: 52, to: 122, w: 22 });
    ctx.save();
    ctx.rotate(-0.12);
    rr(ctx, -34, -26, 90, 52, 24);
    fillStroke(ctx, "#3f8f7a");
    // inner sole
    rr(ctx, -30, -21, 78, 42, 20);
    ctx.fillStyle = "#e8f1ea";
    ctx.fill();
    // thong strap
    ctx.strokeStyle = "#1f4f42";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(14, -18);
    ctx.moveTo(-6, 0);
    ctx.lineTo(14, 18);
    ctx.moveTo(-6, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    circle(ctx, -6, 0, 4.5);
    fillStroke(ctx, "#1f4f42", 2);
    ctx.restore();
  },

  /* wooden ruler */
  ruler(ctx) {
    arm(ctx, { from: 96, to: 148, w: 22 });
    rr(ctx, -8, -15, 112, 30, 4);
    fillStroke(ctx, "#f2c75c");
    ctx.strokeStyle = "rgba(90,60,10,0.55)";
    ctx.lineWidth = 1.6;
    for (let i = 1; i < 12; i += 1) {
      const long = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(i * 9, -15);
      ctx.lineTo(i * 9, -15 + (long ? 11 : 6));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(96, -10);
    ctx.stroke();
  },

  /* cricket bat */
  bat(ctx) {
    arm(ctx, { from: 104, to: 152, w: 22 });
    ctx.beginPath();
    ctx.moveTo(-12, -20);
    ctx.lineTo(56, -13);
    ctx.lineTo(72, -8);
    ctx.lineTo(72, 8);
    ctx.lineTo(56, 13);
    ctx.lineTo(-12, 20);
    ctx.quadraticCurveTo(-22, 0, -12, -20);
    ctx.closePath();
    fillStroke(ctx, "#e8cf9a");
    // splice + grip
    rr(ctx, 68, -9, 40, 18, 6);
    fillStroke(ctx, "#3f3a33");
    ctx.strokeStyle = "#c9b98f";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(74 + i * 9, -8);
      ctx.lineTo(74 + i * 9, 8);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(160,110,50,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, -14);
    ctx.lineTo(58, -8);
    ctx.stroke();
  },

  /* frying pan */
  pan(ctx) {
    arm(ctx, { from: 76, to: 132, w: 22 });
    // handle
    rr(ctx, 48, -8, 60, 16, 7);
    fillStroke(ctx, "#2f3038");
    // pan
    circle(ctx, 6, 0, 36);
    fillStroke(ctx, "#4a4d59");
    circle(ctx, 6, 0, 27);
    ctx.fillStyle = "#2c2f39";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(6, 0, 30, -2.2, -0.6);
    ctx.stroke();
    // rim highlight
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(6, 0, 34, 3.6, 5.2);
    ctx.stroke();
  },

  /* stun gun */
  gun(ctx) {
    arm(ctx, { from: 46, to: 118, w: 24 });
    rr(ctx, 14, -18, 62, 36, 9);
    fillStroke(ctx, "#f2c14e");
    rr(ctx, 30, -10, 26, 20, 5);
    ctx.fillStyle = "#2b2f3d";
    ctx.fill();
    // prongs
    ctx.strokeStyle = STEEL_DARK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, -9);
    ctx.lineTo(-16, -13);
    ctx.moveTo(14, 9);
    ctx.lineTo(-16, 13);
    ctx.stroke();
    // sparks between the prongs
    ctx.strokeStyle = "#9fe3ff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-16, -13);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 2);
    ctx.lineTo(-4, 12);
    ctx.stroke();
    // grip
    rr(ctx, 56, 14, 18, 26, 7);
    fillStroke(ctx, "#3a3f4d");
  },

  /* thrown bomb */
  bomb(ctx) {
    circle(ctx, 0, 0, 30);
    fillStroke(ctx, "#2f3444");
    // highlight
    ctx.globalAlpha = 0.35;
    circle(ctx, -9, -10, 12);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.globalAlpha = 1;
    // fuse
    ctx.strokeStyle = "#8a6a45";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(16, -24);
    ctx.quadraticCurveTo(40, -44, 28, -58);
    ctx.stroke();
    // spark
    circle(ctx, 30, -60, 7);
    ctx.fillStyle = "#ffd84d";
    ctx.fill();
    ctx.strokeStyle = "#ff8a1f";
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  /* fish slap */
  fish(ctx) {
    ctx.beginPath();
    ctx.ellipse(24, 0, 44, 26, 0, 0, TAU);
    fillStroke(ctx, "#7fb7d9");
    // tail
    ctx.beginPath();
    ctx.moveTo(62, 0);
    ctx.lineTo(104, -26);
    ctx.lineTo(96, 0);
    ctx.lineTo(104, 26);
    ctx.closePath();
    fillStroke(ctx, "#5c9cc4");
    // belly
    ctx.beginPath();
    ctx.ellipse(20, 8, 32, 12, 0, 0, TAU);
    ctx.fillStyle = "#cfeaf7";
    ctx.fill();
    // eye + mouth
    circle(ctx, -6, -6, 5);
    ctx.fillStyle = "#0f1722";
    ctx.fill();
    circle(ctx, -8, -8, 1.8);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#2b5d7a";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(-18, 4, 7, 0.4, 1.5);
    ctx.stroke();
    // fin
    ctx.beginPath();
    ctx.moveTo(10, -22);
    ctx.lineTo(26, -34);
    ctx.lineTo(30, -18);
    ctx.closePath();
    fillStroke(ctx, "#5c9cc4", 2.6);
  },

  /* sledgehammer */
  hammer(ctx) {
    arm(ctx, { from: 92, to: 148, w: 23 });
    // handle
    rr(ctx, 30, -7, 96, 14, 6);
    fillStroke(ctx, WOOD);
    ctx.strokeStyle = "rgba(90,50,10,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 2);
    ctx.lineTo(118, 2);
    ctx.stroke();
    // head
    rr(ctx, -22, -34, 56, 68, 10);
    fillStroke(ctx, STEEL);
    rr(ctx, -14, -24, 26, 48, 6);
    ctx.fillStyle = STEEL_DARK;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-16, -22);
    ctx.lineTo(-16, 22);
    ctx.stroke();
  },

  /* cactus */
  cactus(ctx) {
    arm(ctx, { from: 84, to: 138, w: 22 });
    // main body
    rr(ctx, -6, -26, 96, 52, 24);
    fillStroke(ctx, "#4f9d5d");
    // arm
    rr(ctx, 34, -46, 26, 42, 13);
    fillStroke(ctx, "#4f9d5d");
    // ridges
    ctx.strokeStyle = "rgba(20,70,30,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 24, -22);
      ctx.lineTo(6 + i * 24, 22);
      ctx.stroke();
    }
    // spikes
    ctx.strokeStyle = "#f6f1c8";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 9; i += 1) {
      const x = -4 + i * 10;
      const up = i % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x, up * 26);
      ctx.lineTo(x + 3, up * 36);
      ctx.stroke();
    }
    // flower
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU;
      circle(ctx, 40 + Math.cos(a) * 8, -46 + Math.sin(a) * 8, 5);
      ctx.fillStyle = "#ff8fb0";
      ctx.fill();
    }
  },

  /* chainsaw */
  saw(ctx) {
    arm(ctx, { from: 74, to: 132, w: 24 });
    // motor block
    rr(ctx, 40, -24, 66, 48, 10);
    fillStroke(ctx, "#e8642f");
    rr(ctx, 46, -16, 26, 32, 6);
    ctx.fillStyle = "#2b2f3d";
    ctx.fill();
    // rear handle
    rr(ctx, 74, 22, 26, 12, 6);
    fillStroke(ctx, "#2b2f3d");
    // bar
    rr(ctx, -34, -11, 78, 22, 10);
    fillStroke(ctx, STEEL);
    rr(ctx, -30, -6, 70, 12, 6);
    ctx.fillStyle = "#dfe6f2";
    ctx.fill();
    // teeth
    ctx.fillStyle = STEEL_DARK;
    for (let i = 0; i < 11; i += 1) {
      const x = -32 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x, -11);
      ctx.lineTo(x + 4, -17);
      ctx.lineTo(x + 7, -11);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, 11);
      ctx.lineTo(x + 4, 17);
      ctx.lineTo(x + 7, 11);
      ctx.closePath();
      ctx.fill();
    }
  },

  /* fire extinguisher */
  extinguisher(ctx) {
    arm(ctx, { from: 60, to: 124, w: 24 });
    // bottle
    rr(ctx, 34, -24, 62, 48, 16);
    fillStroke(ctx, "#d9382f");
    rr(ctx, 44, -14, 16, 28, 5);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
    // neck + horn
    rr(ctx, 12, -10, 26, 20, 6);
    fillStroke(ctx, "#8a2b24");
    ctx.beginPath();
    ctx.moveTo(12, -16);
    ctx.lineTo(-22, -26);
    ctx.lineTo(-22, 26);
    ctx.lineTo(12, 16);
    ctx.closePath();
    fillStroke(ctx, "#2c2f39");
    // foam puff
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 4; i += 1) {
      circle(ctx, -30 - i * 7, Math.sin(i * 2) * 14, 10 - i * 1.6);
      ctx.fillStyle = "rgba(220,245,255,0.8)";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // gauge
    circle(ctx, 66, -4, 7);
    fillStroke(ctx, "#f4f7ff", 2);
  },

  /* rocket */
  rocket(ctx) {
    // body
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.quadraticCurveTo(-10, -18, 44, -14);
    ctx.lineTo(44, 14);
    ctx.quadraticCurveTo(-10, 18, -42, 0);
    ctx.closePath();
    fillStroke(ctx, "#e9eef7");
    // nose
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.quadraticCurveTo(-22, -11, -6, -14);
    ctx.lineTo(-6, 14);
    ctx.quadraticCurveTo(-22, 11, -42, 0);
    ctx.closePath();
    fillStroke(ctx, "#e0453f", 2.8);
    // fins
    ctx.beginPath();
    ctx.moveTo(30, -14);
    ctx.lineTo(52, -32);
    ctx.lineTo(56, -12);
    ctx.closePath();
    fillStroke(ctx, "#e0453f", 2.6);
    ctx.beginPath();
    ctx.moveTo(30, 14);
    ctx.lineTo(52, 32);
    ctx.lineTo(56, 12);
    ctx.closePath();
    fillStroke(ctx, "#e0453f", 2.6);
    // flame
    const g = ctx.createLinearGradient(56, 0, 120, 0);
    g.addColorStop(0, "rgba(255,220,120,0.95)");
    g.addColorStop(0.5, "rgba(255,140,40,0.8)");
    g.addColorStop(1, "rgba(255,90,20,0)");
    ctx.beginPath();
    ctx.moveTo(54, -12);
    ctx.quadraticCurveTo(104, 0, 54, 12);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  },

  /* anvil */
  anvil(ctx) {
    // base
    rr(ctx, -30, 26, 74, 20, 4);
    fillStroke(ctx, "#4a5162");
    // body
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(52, -4);
    ctx.lineTo(44, 26);
    ctx.lineTo(2, 26);
    ctx.closePath();
    fillStroke(ctx, "#616b80");
    // top face + horn
    ctx.beginPath();
    ctx.moveTo(-26, -26);
    ctx.lineTo(54, -26);
    ctx.lineTo(62, -12);
    ctx.lineTo(54, -4);
    ctx.lineTo(-8, -4);
    ctx.quadraticCurveTo(-24, -6, -26, -26);
    ctx.closePath();
    fillStroke(ctx, "#77839a");
    ctx.beginPath();
    ctx.moveTo(54, -26);
    ctx.quadraticCurveTo(80, -22, 60, -10);
    ctx.closePath();
    fillStroke(ctx, "#77839a", 2.8);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, -22);
    ctx.lineTo(48, -22);
    ctx.stroke();
  },

  /* electric guitar */
  guitar(ctx) {
    arm(ctx, { from: 96, to: 148, w: 22 });
    // body
    ctx.beginPath();
    ctx.ellipse(18, 0, 46, 34, 0, 0, TAU);
    fillStroke(ctx, "#e0453f");
    ctx.beginPath();
    ctx.ellipse(34, 0, 26, 22, 0, 0, TAU);
    ctx.fillStyle = "#8c1f1b";
    ctx.fill();
    // pickups
    ctx.fillStyle = "#2b2f3d";
    rr(ctx, 6, -14, 8, 28, 3);
    ctx.fill();
    rr(ctx, 20, -14, 8, 28, 3);
    ctx.fill();
    // neck
    rr(ctx, 56, -7, 84, 14, 4);
    fillStroke(ctx, "#c99a5e");
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(58, -4 + i * 2.7);
      ctx.lineTo(138, -4 + i * 2.7);
      ctx.stroke();
    }
    // headstock
    rr(ctx, 132, -11, 22, 22, 5);
    fillStroke(ctx, "#2b2f3d");
  },
};

export const RIG_NAMES = Object.keys(RIGS);

/** Approximate drawing bounds per rig, used to centre weapon icons. */
export const RIG_BOUNDS = {
  leg: [-32, -28, 132, 28],
  fist: [-34, -30, 130, 30],
  glove: [-50, -40, 130, 40],
  hand: [-18, -34, 124, 34],
  sole: [-42, -30, 128, 30],
  ruler: [-10, -18, 154, 18],
  bat: [-24, -22, 114, 22],
  pan: [-32, -38, 138, 38],
  hammer: [-24, -38, 154, 38],
  gun: [-20, -20, 124, 46],
  bomb: [-32, -64, 42, 32],
  fish: [-22, -34, 110, 30],
  cactus: [-10, -52, 144, 38],
  saw: [-40, -26, 150, 38],
  extinguisher: [-64, -28, 128, 30],
  rocket: [-44, -34, 122, 34],
  anvil: [-32, -28, 82, 48],
  guitar: [-20, -38, 160, 38],
};

export function drawRig(ctx, rig, opts = {}) {
  const fn = RIGS[rig] || RIGS.fist;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  fn(ctx, opts);
  ctx.restore();
}

/** Rasterise a rig into a small image for the dock / shop. */
const iconCache = new Map();

export function weaponIcon(rig, size = 64, opts = {}) {
  const key = `${rig}:${size}:${opts.flip ? 1 : 0}`;
  if (iconCache.has(key)) return iconCache.get(key);
  let url = "";
  try {
    const [x0, y0, x1, y1] = RIG_BOUNDS[rig] || [-40, -40, 140, 40];
    const w = x1 - x0;
    const h = y1 - y0;
    const pad = 0.12;
    const k = (size * (1 - pad * 2)) / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.translate(size / 2, size / 2);
    if (opts.flip) ctx.scale(-1, 1);
    ctx.scale(k, k);
    ctx.translate(-(x0 + w / 2), -(y0 + h / 2));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    drawRig(ctx, rig);
    url = canvas.toDataURL("image/png");
  } catch {
    url = "";
  }
  iconCache.set(key, url);
  return url;
}
