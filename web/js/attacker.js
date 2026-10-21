/* Attacker: brings the actual weapon into frame, winds up, then connects.
 *
 * Damage is only applied when the rig physically reaches the target, so the
 * player always *sees* the fist / shoe / bat / pan coming before the hit.
 */

import { drawRig } from "./weaponry.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* Keyframes: p = progress, d = distance from target (1 = anchor), r = extra
 * rotation, s = scale, a = alpha. */
const PROFILES = {
  swing: {
    arc: 0.3,
    trail: true,
    keys: [
      { p: 0, d: 1.18, r: 0.55, s: 0.82, a: 0 },
      { p: 0.12, d: 0.92, r: 0.3, s: 0.9, a: 1 },
      { p: 0.46, d: 0.3, r: 0.78, s: 1, a: 1 },
      { p: 0.58, d: 0.38, r: 0.95, s: 1.02, a: 1 },
      { p: 0.7, d: 0, r: -0.55, s: 1.1, a: 1 },
      { p: 0.82, d: 0.16, r: -0.62, s: 1.04, a: 1 },
      { p: 1, d: 1.12, r: -0.2, s: 0.86, a: 0 },
    ],
  },
  thrust: {
    arc: 0.06,
    trail: true,
    keys: [
      { p: 0, d: 1.25, r: 0.15, s: 0.85, a: 0 },
      { p: 0.16, d: 0.85, r: 0.1, s: 0.95, a: 1 },
      { p: 0.44, d: 0.34, r: 0.04, s: 1, a: 1 },
      { p: 0.56, d: 0.42, r: 0.02, s: 1, a: 1 },
      { p: 0.68, d: 0, r: 0, s: 1.06, a: 1 },
      { p: 0.86, d: 0.2, r: 0.02, s: 1, a: 1 },
      { p: 1, d: 1.2, r: 0.1, s: 0.86, a: 0 },
    ],
  },
  drop: {
    arc: 0,
    trail: true,
    keys: [
      { p: 0, d: 1.5, r: -0.22, s: 0.95, a: 0 },
      { p: 0.1, d: 1.3, r: -0.2, s: 1, a: 1 },
      { p: 0.52, d: 0.55, r: -0.12, s: 1.02, a: 1 },
      { p: 0.64, d: 0, r: 0, s: 1.06, a: 1 },
      { p: 0.7, d: -0.04, r: 0.03, s: 1.02, a: 1 },
      { p: 0.9, d: -0.03, r: 0.02, s: 1, a: 1 },
      { p: 1, d: 0.6, r: 0.05, s: 0.9, a: 0 },
    ],
  },
  toss: {
    arc: 0.34,
    spin: -7.5,
    trail: true,
    keys: [
      { p: 0, d: 1.2, r: 0.2, s: 0.9, a: 0 },
      { p: 0.1, d: 1.0, r: 0.1, s: 0.95, a: 1 },
      { p: 0.5, d: 0.5, r: 0, s: 1, a: 1 },
      { p: 0.72, d: 0, r: 0, s: 1.05, a: 1 },
      { p: 0.84, d: -0.05, r: 0, s: 0.9, a: 0.9 },
      { p: 1, d: -0.2, r: 0, s: 0.7, a: 0 },
    ],
  },
  projectile: {
    arc: 0.04,
    trail: true,
    keys: [
      { p: 0, d: 1.35, r: 0.06, s: 0.9, a: 0 },
      { p: 0.12, d: 1.05, r: 0.04, s: 0.95, a: 1 },
      { p: 0.48, d: 0.36, r: 0.02, s: 1, a: 1 },
      { p: 0.58, d: 0, r: 0, s: 1.08, a: 1 },
      { p: 0.66, d: -0.06, r: 0, s: 1.1, a: 0.7 },
      { p: 1, d: -0.1, r: 0, s: 1, a: 0 },
    ],
  },
  sweep: {
    arc: 0.1,
    trail: true,
    keys: [
      { p: 0, d: 1.3, r: 0.12, s: 0.85, a: 0 },
      { p: 0.14, d: 0.9, r: 0.08, s: 0.95, a: 1 },
      { p: 0.34, d: 0.12, r: 0.02, s: 1, a: 1 },
      { p: 0.56, d: -0.06, r: 0, s: 1.04, a: 1 },
      { p: 0.86, d: -0.05, r: 0.02, s: 1.03, a: 1 },
      { p: 1, d: 1.25, r: 0.1, s: 0.86, a: 0 },
    ],
  },
};

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function sampleProfile(profile, p) {
  const keys = profile.keys;
  const clamped = clamp(p, 0, 1);
  let i = 0;
  while (i < keys.length - 2 && clamped > keys[i + 1].p) i += 1;
  const a = keys[i];
  const b = keys[i + 1] || keys[i];
  const span = b.p - a.p || 1;
  const t = smoothstep(clamp((clamped - a.p) / span, 0, 1));
  return {
    d: lerp(a.d, b.d, t),
    r: lerp(a.r, b.r, t),
    s: lerp(a.s, b.s, t),
    a: lerp(a.a, b.a, t),
  };
}

function chooseAnchor(motion, target, width, height) {
  const dir = target.x < width * 0.5 ? -1 : 1;
  switch (motion) {
    case "drop":
      return { x: target.x + (Math.random() - 0.5) * 26, y: -height * 0.3 };
    case "toss":
      return {
        x: target.x - dir * width * 0.46,
        y: height + height * 0.16,
      };
    case "projectile":
      return {
        x: target.x + dir * width * 0.78,
        y: target.y - height * 0.12,
      };
    case "thrust":
      return {
        x: target.x + dir * width * 0.5,
        y: target.y + (Math.random() - 0.5) * height * 0.04,
      };
    case "sweep":
      return {
        x: target.x + dir * width * 0.44,
        y: target.y - height * 0.02,
      };
    case "swing":
    default:
      return {
        x: target.x + dir * width * 0.48,
        y: target.y - height * (0.12 + Math.random() * 0.05),
      };
  }
}

export class Attacker {
  constructor() {
    this.swings = [];
  }

  clear() {
    this.swings = [];
  }

  get active() {
    return this.swings.length > 0;
  }

  /**
   * Launch a weapon at a point.
   * @returns the swing object (useful for tests / debugging)
   */
  start(weapon, target, { width, height, unit = 1, onHit } = {}) {
    const motion = weapon.motion || "swing";
    const profile = PROFILES[motion] || PROFILES.swing;
    const anchor = chooseAnchor(motion, target, width, height);
    const swing = {
      weapon,
      motion,
      profile,
      target: { x: target.x, y: target.y },
      anchor,
      A: { x: anchor.x - target.x, y: anchor.y - target.y },
      elapsed: 0,
      duration: Math.max(0.16, (weapon.swing || 520) / 1000),
      hits: (weapon.hits || [{ at: 0.7, mult: 1 }]).map((hit) => ({ ...hit, done: false })),
      onHit,
      unit,
      seed: Math.random() * 100,
      done: false,
    };
    this.swings.push(swing);
    if (this.swings.length > 4) this.swings.shift();
    return swing;
  }

  update(dt) {
    for (let i = this.swings.length - 1; i >= 0; i -= 1) {
      const swing = this.swings[i];
      swing.elapsed += dt;
      const p = clamp(swing.elapsed / swing.duration, 0, 1);
      for (let h = 0; h < swing.hits.length; h += 1) {
        const hit = swing.hits[h];
        if (!hit.done && p >= hit.at) {
          hit.done = true;
          if (swing.onHit) {
            swing.onHit({
              x: swing.target.x,
              y: swing.target.y,
              mult: hit.mult ?? 1,
              index: h,
              weapon: swing.weapon,
            });
          }
        }
      }
      if (p >= 1) {
        swing.done = true;
        this.swings.splice(i, 1);
      }
    }
  }

  /** Everything the renderer needs for one frame, without drawing. */
  poses() {
    const out = [];
    for (const swing of this.swings) {
      const p = clamp(swing.elapsed / swing.duration, 0, 1);
      out.push(this._poseAt(swing, p));
    }
    return out;
  }

  _poseAt(swing, p) {
    const { profile, A, target } = swing;
    const weapon = swing.weapon;
    const k = sampleProfile(profile, p);
    const baseAngle = Math.atan2(A.y, A.x);
    // "drop" weapons are authored upright, so they keep a fixed orientation
    const fall = swing.motion === "drop" && weapon.fallRot !== undefined;
    const wobble = swing.motion === "thrust" ? Math.sin(p * 40 + swing.seed) * 0.02 : 0;
    const spin = (profile.spin || 0) * p;

    // perpendicular arc that makes the swing read as a curve instead of a line
    const len = Math.hypot(A.x, A.y) || 1;
    const px = -A.y / len;
    const py = A.x / len;
    const arcAmount = (profile.arc || 0) * len * Math.sin(Math.PI * clamp(p / 0.9, 0, 1));

    return {
      swing,
      x: target.x + A.x * k.d + px * arcAmount,
      y: target.y + A.y * k.d + py * arcAmount,
      angle: fall ? weapon.fallRot + k.r * 0.45 : baseAngle + k.r + spin + wobble,
      scale: k.s * (swing.unit || 1),
      alpha: k.a,
      p,
      motion: swing.motion,
    };
  }

  draw(ctx, { unit = 1 } = {}) {
    for (const swing of this.swings) {
      const profile = swing.profile;
      const p = clamp(swing.elapsed / swing.duration, 0, 1);

      // motion trail during the fast part of the arc
      if (profile.trail && p > 0.1 && p < 0.9) {
        const speed = profile.keys.some((key) => key.d === 0) ? 1 : 0;
        if (speed) {
          for (let ghost = 1; ghost <= 2; ghost += 1) {
            const gp = clamp(p - ghost * 0.035, 0, 1);
            const pose = this._poseAt(swing, gp);
            this._drawPose(ctx, pose, {
              unit,
              alpha: pose.alpha * (0.26 / ghost),
              trail: true,
            });
          }
        }
      }

      const pose = this._poseAt(swing, p);
      this._drawPose(ctx, pose, { unit });
    }
  }

  _drawPose(ctx, pose, { unit = 1, alpha = null, trail = false } = {}) {
    const weapon = pose.swing.weapon;
    const rigScale = (weapon.rigScale || 1) * Math.max(unit, 0.82) * 1.14;
    const contact = weapon.contact || [0, 0];
    ctx.save();
    ctx.globalAlpha = (alpha ?? pose.alpha) * (trail ? 0.55 : 1);
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.scale(pose.scale * rigScale, pose.scale * rigScale);
    // put the weapon's striking point exactly on the target
    ctx.translate(-contact[0], -contact[1]);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = trail ? 0 : 14;
    ctx.shadowOffsetY = trail ? 0 : 8;
    drawRig(ctx, weapon.rig);
    ctx.restore();
  }
}

export { PROFILES };
export const TAU_CONST = TAU;
