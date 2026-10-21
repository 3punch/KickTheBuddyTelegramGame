/* The Professor — a hand-drawn, spring-driven 2D ragdoll.
 *
 * No sprite sheets: every limb is a capsule with its own spring, so hits feel
 * physical and the face can be swapped for any photo at runtime.
 */

const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const COLORS = {
  skin: "#f7c9a3",
  skinShade: "#e2a97e",
  skinLine: "#8c5a3a",
  coat: "#f6f9ff",
  coatShade: "#d3dcec",
  shirt: "#a8caf5",
  tie: "#e0524a",
  trouser: "#39415f",
  trouserShade: "#2b3249",
  shoe: "#4b3327",
  hair: "#e6e9f2",
  hairShade: "#c3c9d9",
  ink: "#2a1c15",
  glass: "#2f3a52",
  lens: "rgba(150, 205, 255, 0.28)",
  blush: "rgba(255, 120, 110, 0.32)",
};

export class Doll {
  constructor(options = {}) {
    this.basePosition = { x: 0, y: 0 };
    this.root = { x: 0, y: 0, ox: 0, oy: 0, vx: 0, vy: 0, angle: 0, vAngle: 0 };
    this.scale = 1;
    this.time = 0;
    this.pointer = { x: 0, y: 0 };
    this.lookAt = { x: 0, y: 0 };
    this.blink = 0;
    this.nextBlink = 2 + Math.random() * 3;

    this.expression = "idle";
    this.expressionTimer = 0;
    this.stun = 0;
    this.ragdoll = false;
    this.reviveTimer = 0;
    this.koTimer = 0;
    this.squash = { x: 1, y: 1, vx: 0, vy: 0 };
    this.bandaids = [];
    this.faceImage = null;
    this.faceMeta = null;
    this.dollImage = null;
    this.dollMeta = null;
    this.hitFlash = 0;
    this.onImpact = options.onImpact || (() => {});
    this.groundY = 0;
    this._buildSkeleton();
  }

  _buildSkeleton() {
    const B = {
      headR: 39,
      torso: 74,
      neck: 10,
      shoulderX: 31,
      shoulderDrop: 14,
      hipX: 19,
      upperArm: 40,
      foreArm: 37,
      hand: 11,
      thigh: 52,
      shin: 50,
      foot: 26,
      limbW: 20,
    };
    this.B = B;

    const node = (name, parent, px, py, rest, opts = {}) => ({
      name,
      parent,
      px,
      py,
      angle: rest,
      rest,
      vel: 0,
      k: opts.k ?? 180,
      d: opts.d ?? 16,
      min: opts.min ?? -1.4,
      max: opts.max ?? 1.4,
      len: opts.len ?? 0,
      w: opts.w ?? B.limbW,
      wx: 0,
      wy: 0,
      wa: 0,
    });

    this.nodes = {
      torso: node("torso", null, 0, 0, 0, {
        k: 150,
        d: 14,
        min: -0.7,
        max: 0.7,
        len: B.torso,
      }),
      head: node("head", "torso", 0, -B.torso, 0, { k: 130, d: 12, min: -0.75, max: 0.75 }),
      armL: node("armL", "torso", -B.shoulderX, -B.torso + B.shoulderDrop, 0.16, {
        len: B.upperArm,
        w: B.limbW + 2,
        min: -1.9,
        max: 1.1,
      }),
      foreL: node("foreL", "armL", 0, B.upperArm, 0.12, {
        len: B.foreArm,
        w: B.limbW,
        min: -1.9,
        max: 0.6,
      }),
      armR: node("armR", "torso", B.shoulderX, -B.torso + B.shoulderDrop, -0.16, {
        len: B.upperArm,
        w: B.limbW + 2,
        min: -1.1,
        max: 1.9,
      }),
      foreR: node("foreR", "armR", 0, B.upperArm, -0.12, {
        len: B.foreArm,
        w: B.limbW,
        min: -0.6,
        max: 1.9,
      }),
      legL: node("legL", null, -B.hipX, 0, 0.055, {
        len: B.thigh,
        w: B.limbW + 6,
        k: 210,
        d: 18,
        min: -0.9,
        max: 0.9,
      }),
      shinL: node("shinL", "legL", 0, B.thigh, 0.02, {
        len: B.shin,
        w: B.limbW + 3,
        k: 230,
        d: 20,
        min: -0.5,
        max: 1.1,
      }),
      legR: node("legR", null, B.hipX, 0, -0.055, {
        len: B.thigh,
        w: B.limbW + 6,
        k: 210,
        d: 18,
        min: -0.9,
        max: 0.9,
      }),
      shinR: node("shinR", "legR", 0, B.thigh, -0.02, {
        len: B.shin,
        w: B.limbW + 3,
        k: 230,
        d: 20,
        min: -1.1,
        max: 0.5,
      }),
    };
    this.order = ["torso", "head", "armL", "foreL", "armR", "foreR", "legL", "shinL", "legR", "shinR"];
    for (const key of this.order) this.nodes[key].base = { ...this.nodes[key] };
  }

  /* ── layout ──────────────────────────────────────────────────────────── */

  resize(width, height) {
    const targetHeight = clamp(height * 0.55, 250, 600);
    const natural = this.B.headR * 2 + this.B.torso + this.B.thigh + this.B.shin;
    this.scale = targetHeight / natural;
    this.basePosition.x = width / 2;
    this.basePosition.y = height * 0.475;
    this.groundY = this.basePosition.y + (this.B.thigh + this.B.shin + this.B.foot) * this.scale * 0.62;
  }

  reset() {
    const r = this.root;
    r.ox = 0;
    r.oy = 0;
    r.vx = 0;
    r.vy = 0;
    r.angle = 0;
    r.vAngle = 0;
    this.ragdoll = false;
    this.reviveTimer = 0;
    this.koTimer = 0;
    this.expression = "idle";
    this.expressionTimer = 0;
    this.stun = 0;
    this.bandaids = [];
    this.squash = { x: 1, y: 1, vx: 0, vy: 0 };
    for (const key of this.order) {
      const n = this.nodes[key];
      n.angle = n.base.angle;
      n.vel = 0;
    }
  }

  setFace(image, meta) {
    this.faceImage = image || null;
    this.faceMeta = meta || null;
  }

  setDollImage(image, meta) {
    this.dollImage = image || null;
    this.dollMeta = meta || null;
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
    const head = this.world?.head;
    if (head) {
      const dx = x - head.wx;
      const dy = y - head.wy;
      const len = Math.hypot(dx, dy) || 1;
      this.lookAt.x = clamp(dx / len, -1, 1);
      this.lookAt.y = clamp(dy / len, -1, 1);
    }
  }

  /* ── simulation ──────────────────────────────────────────────────────── */

  update(dt) {
    const step = Math.min(dt, 1 / 45);
    this.time += step;

    // blink loop
    this.nextBlink -= step;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2.2 + Math.random() * 3.4;
    }
    this.blink = Math.max(0, this.blink - step);
    if (this.expressionTimer > 0) {
      this.expressionTimer -= step;
      if (this.expressionTimer <= 0 && this.expression !== "ko") this.expression = "idle";
    }
    this.stun = Math.max(0, this.stun - step);
    this.hitFlash = Math.max(0, this.hitFlash - step * 3.4);

    // squash & stretch spring
    const sq = this.squash;
    sq.vx += (1 - sq.x) * 190 * step;
    sq.vy += (1 - sq.y) * 190 * step;
    sq.vx *= 1 - Math.min(1, 10 * step);
    sq.vy *= 1 - Math.min(1, 10 * step);
    sq.x = clamp(sq.x + sq.vx * step, 0.72, 1.34);
    sq.y = clamp(sq.y + sq.vy * step, 0.72, 1.34);

    const r = this.root;
    if (this.ragdoll) {
      r.vy += 2600 * step;
      r.oy += r.vy * step;
      r.ox += r.vx * step;
      r.vx *= 1 - Math.min(1, 1.4 * step);
      r.angle += r.vAngle * step;
      r.vAngle *= 1 - Math.min(1, 1.1 * step);
      const groundLimit = this.groundY - this.basePosition.y - this.B.torso * this.scale * 0.1;
      if (r.oy > groundLimit) {
        r.oy = groundLimit;
        if (Math.abs(r.vy) > 130) {
          r.vy *= -0.32;
          this.onImpact("ground", r.x + r.ox, this.groundY, Math.abs(r.vy));
        } else {
          r.vy = 0;
        }
        r.vx *= 0.86;
        r.vAngle *= 0.84;
        // lie flat
        const target = r.angle > 0 ? 1.48 : -1.48;
        r.angle = lerp(r.angle, target, Math.min(1, 6 * step));
      }
      r.ox = clamp(r.ox, -110 * this.scale, 110 * this.scale);
    } else {
      // knockback spring back to the standing spot
      r.vx += (-r.ox * 190 - r.vx * 20) * step;
      r.vy += (-r.oy * 190 - r.vy * 20) * step;
      r.ox += r.vx * step;
      r.oy += r.vy * step;
      r.vAngle += (-r.angle * 170 - r.vAngle * 16) * step;
      r.angle += r.vAngle * step;
      r.ox = clamp(r.ox, -90 * this.scale, 90 * this.scale);
      r.oy = clamp(r.oy, -60 * this.scale, 90 * this.scale);
    }

    // limb springs
    for (const key of this.order) {
      const n = this.nodes[key];
      if (this.ragdoll) {
        n.vel += (Math.sin(this.time * 6 + n.px * 0.2) * 3 - n.vel * 1.6) * step;
      } else {
        const breathe = Math.sin(this.time * 1.9) * 0.012;
        const extra = key.startsWith("arm") ? breathe * 2 : breathe;
        const target = n.rest + extra + (key === "head" ? Math.sin(this.time * 0.8) * 0.03 : 0);
        const accel = -n.k * (n.angle - target) - n.d * n.vel;
        n.vel += accel * step;
      }
      n.angle += n.vel * step;
      if (this.stun > 0) n.angle += Math.sin(this.time * 22 + n.px) * 0.006;
      if (n.angle < n.min) {
        n.angle = n.min;
        n.vel *= -0.25;
      } else if (n.angle > n.max) {
        n.angle = n.max;
        n.vel *= -0.25;
      }
    }

    // recovery from KO
    if (this.ragdoll && this.reviveTimer > 0) {
      this.reviveTimer -= step;
      if (this.reviveTimer <= 0) this._standUp();
    }
    this.koTimer = Math.max(0, this.koTimer - step);

    this._updateWorld();
  }

  _updateWorld() {
    const s = this.scale;
    const r = this.root;
    const rootX = this.basePosition.x + r.ox;
    const rootY = this.basePosition.y + r.oy;
    const world = {
      root: { wx: rootX, wy: rootY, wa: r.angle, len: 0, w: 0 },
    };
    for (const key of this.order) {
      const n = this.nodes[key];
      const parent = n.parent ? world[n.parent] : world.root;
      const cos = Math.cos(parent.wa);
      const sin = Math.sin(parent.wa);
      const px = n.px * s;
      const py = n.py * s;
      n.wx = parent.wx + px * cos - py * sin;
      n.wy = parent.wy + px * sin + py * cos;
      n.wa = parent.wa + n.angle;
      n.lenPx = n.len * s;
      world[key] = n;
    }
    this.world = world;
    this.shapes = this._buildShapes();
  }

  _buildShapes() {
    const w = this.world;
    const s = this.scale;
    const shapes = [];
    const along = (node, fractions, radius, part) => {
      for (const f of fractions) {
        shapes.push({
          x: node.wx - Math.sin(node.wa) * node.lenPx * f,
          y: node.wy + Math.cos(node.wa) * node.lenPx * f,
          r: radius * s,
          part,
        });
      }
    };
    const headCenter = this._localToWorld(w.head, 0, -this.B.headR * 0.95);
    shapes.push({ x: headCenter.x, y: headCenter.y, r: this.B.headR * 1.02 * s, part: "head" });
    along(w.torso, [0.2, 0.55, 0.9], this.B.torso * 0.27, "torso");
    shapes.push({ x: w.root.wx, y: w.root.wy, r: 26 * s, part: "hips" });
    along(w.armL, [0.3, 0.7, 1], 13 * s, "armL");
    along(w.foreL, [0.45, 0.95], 14 * s, "foreL");
    along(w.armR, [0.3, 0.7, 1], 13 * s, "armR");
    along(w.foreR, [0.45, 0.95], 14 * s, "foreR");
    along(w.legL, [0.35, 0.8], 17 * s, "legL");
    along(w.shinL, [0.4, 0.95], 15 * s, "shinL");
    along(w.legR, [0.35, 0.8], 17 * s, "legR");
    along(w.shinR, [0.4, 0.95], 15 * s, "shinR");
    return shapes;
  }

  _localToWorld(node, lx, ly) {
    const s = this.scale;
    const cos = Math.cos(node.wa);
    const sin = Math.sin(node.wa);
    return {
      x: node.wx + lx * s * cos - ly * s * sin,
      y: node.wy + lx * s * sin + ly * s * cos,
    };
  }

  /** Nearest body part to a point. `tolerance` lets near-misses count. */
  hitTest(x, y, tolerance = 24) {
    let best = null;
    let bestDist = Infinity;
    for (const shape of this.shapes || []) {
      const d = Math.hypot(x - shape.x, y - shape.y) - shape.r;
      if (d < tolerance && d < bestDist) {
        bestDist = d;
        best = shape;
      }
    }
    return best;
  }

  /* ── reactions ───────────────────────────────────────────────────────── */

  hurt(amount, point, impulse = 1, { heavy = false } = {}) {
    if (this.ragdoll) return;
    const shape = point?.part ? point : this.hitTest(point?.x ?? 0, point?.y ?? 0, 40);
    const part = shape?.part || "torso";
    const node = this.nodes[part] || this.nodes.torso;
    const dir = (point?.x ?? this.basePosition.x) < this.basePosition.x + this.root.ox ? 1 : -1;

    node.vel += dir * impulse * 6 + (Math.random() - 0.5) * 2;
    if (part === "head") {
      this.nodes.torso.vel += dir * impulse * 2.4;
      this.expression = "hurt";
      this.expressionTimer = 0.55;
      this.hitFlash = 1;
    } else {
      this.expression = Math.random() < 0.4 ? "hurt" : "annoyed";
      this.expressionTimer = 0.4;
    }

    const r = this.root;
    r.vx += dir * impulse * 56;
    r.vy -= impulse * 16;
    r.vAngle += dir * impulse * 0.75;

    this.squash.vx += (Math.random() < 0.5 ? -1 : 1) * 3 * Math.min(1.6, impulse);
    this.squash.vy -= 2.2 * Math.min(1.6, impulse);

    if (Math.random() < 0.55 && this.bandaids.length < 6) {
      this.bandaids.push({
        u: (Math.random() - 0.5) * 1.4,
        v: 0.2 + Math.random() * 0.7,
        rot: (Math.random() - 0.5) * 1.2,
        age: 0,
        where: Math.random() < 0.4 ? "head" : "chest",
      });
    }

    if (heavy) {
      this.stun = Math.max(this.stun, 0.5);
      this.expression = "dizzy";
      this.expressionTimer = 1.1;
    }
  }

  ko(duration = 2.4) {
    this.ragdoll = true;
    this.expression = "ko";
    this.expressionTimer = 999;
    this.reviveTimer = duration;
    this.stun = 0;
    const r = this.root;
    r.vy = -420;
    r.vx = (Math.random() < 0.5 ? -1 : 1) * 210;
    r.vAngle = (Math.random() < 0.5 ? -1 : 1) * 5.5;
    for (const key of this.order) {
      const n = this.nodes[key];
      n.vel += (Math.random() - 0.5) * 13;
    }
  }

  _standUp() {
    this.ragdoll = false;
    this.expression = "dizzy";
    this.expressionTimer = 0.9;
    const r = this.root;
    r.angle = 0;
    r.oy = 0;
    r.ox = 0;
    r.vy = -260;
    r.vx = 0;
    r.vAngle = 0;
    this.squash.vy -= 3;
    for (const key of this.order) this.nodes[key].vel = (Math.random() - 0.5) * 4;
  }

  /* ── drawing ─────────────────────────────────────────────────────────── */

  draw(ctx) {
    const s = this.scale;
    const w = this.world;
    const r = this.root;

    // shadow
    const shadowAlpha = this.ragdoll ? 0.3 : 0.34;
    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(
      this.basePosition.x + r.ox * 0.6,
      this.groundY + 8,
      52 * s * (1 - Math.min(0.4, Math.abs(r.oy) / (200 * s))),
      13 * s,
      0,
      0,
      TAU
    );
    ctx.fill();
    ctx.restore();

    ctx.save();

    // global squash & stretch anchored at the hips
    ctx.translate(w.root.wx, w.root.wy);
    ctx.scale(this.squash.x, this.squash.y);
    ctx.translate(-w.root.wx, -w.root.wy);

    if (this.dollImage) {
      this._drawImageDoll(ctx);
      ctx.restore();
      this._drawStunStars(ctx);
      return;
    }

    const outline = Math.max(2, 2.6 * s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Legs (behind the body)
    this._drawLeg(ctx, w.legL, w.shinL, outline, true);
    this._drawLeg(ctx, w.legR, w.shinR, outline, false);

    // Back arm first for depth
    this._drawArm(ctx, w.armL, w.foreL, outline);
    this._drawArm(ctx, w.armR, w.foreR, outline);

    this._drawTorso(ctx, outline);
    this._drawHead(ctx, outline);

    if (this.hitFlash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.hitFlash * 0.35;
      ctx.fillStyle = "#ff8a6a";
      const c = this._localToWorld(w.head, 0, -this.B.headR * 0.95);
      ctx.beginPath();
      ctx.arc(c.x, c.y, this.B.headR * 1.6 * s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    this._drawStunStars(ctx);
  }

  _limbPath(ctx, len, width) {
    roundRect(ctx, -width / 2, -width * 0.35, width, len + width * 0.7, width / 2);
  }

  _drawLeg(ctx, thigh, shin, outline, isLeft) {
    const s = this.scale;
    const legW = thigh.w * s;
    const shinW = shin.w * s;

    // thigh (trousers)
    ctx.save();
    ctx.translate(thigh.wx, thigh.wy);
    ctx.rotate(thigh.wa);
    this._limbPath(ctx, thigh.lenPx, legW);
    ctx.fillStyle = isLeft ? COLORS.trouser : COLORS.trouserShade;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();
    ctx.restore();

    // shin
    ctx.save();
    ctx.translate(shin.wx, shin.wy);
    ctx.rotate(shin.wa);
    this._limbPath(ctx, shin.lenPx, shinW);
    ctx.fillStyle = COLORS.trouser;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();

    // sock
    roundRect(ctx, -shinW / 2, shin.lenPx - shinW * 0.72, shinW, shinW * 0.75, shinW * 0.3);
    ctx.fillStyle = "#e8edf7";
    ctx.fill();

    // shoe
    ctx.save();
    ctx.translate(0, shin.lenPx);
    roundRect(ctx, -shinW * 0.72, -shinW * 0.2, shinW * 1.7, shinW * 0.72, shinW * 0.32);
    ctx.fillStyle = COLORS.shoe;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    roundRect(ctx, -shinW * 0.6, -shinW * 0.14, shinW * 1.3, shinW * 0.14, shinW * 0.1);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.restore();
  }

  _drawArm(ctx, upper, fore, outline) {
    const s = this.scale;
    const wUpper = upper.w * s;
    const wFore = fore.w * s;
    const skin = this.expression === "ko" ? COLORS.skinShade : COLORS.skin;

    ctx.save();
    ctx.translate(upper.wx, upper.wy);
    ctx.rotate(upper.wa);
    this._limbPath(ctx, upper.lenPx, wUpper);
    ctx.fillStyle = COLORS.coat;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();
    // sleeve cuff
    roundRect(ctx, -wUpper / 2, upper.lenPx - wUpper * 0.5, wUpper, wUpper * 0.5, wUpper * 0.22);
    ctx.fillStyle = COLORS.coatShade;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(fore.wx, fore.wy);
    ctx.rotate(fore.wa);
    this._limbPath(ctx, fore.lenPx, wFore * 0.88);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();
    // hand
    const handR = this.B.hand * s;
    ctx.beginPath();
    ctx.arc(0, fore.lenPx + handR * 0.35, handR, 0, TAU);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawTorso(ctx, outline) {
    const s = this.scale;
    const torso = this.world.torso;
    const len = torso.lenPx;
    const w = 64 * s;

    ctx.save();
    ctx.translate(torso.wx, torso.wy);
    ctx.rotate(torso.wa);
    // local space: hips at (0,0), shoulders at (0,-len)

    // shirt underneath
    roundRect(ctx, -w * 0.44, -len * 0.99, w * 0.88, len * 1.03, w * 0.4);
    ctx.fillStyle = COLORS.shirt;
    ctx.fill();

    // lab coat: one clean silhouette from shoulders to hem
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -len * 0.94);
    ctx.quadraticCurveTo(-w * 0.62, -len * 0.5, -w * 0.56, -len * 0.02);
    ctx.quadraticCurveTo(0, len * 0.06, w * 0.56, -len * 0.02);
    ctx.quadraticCurveTo(w * 0.62, -len * 0.5, w * 0.5, -len * 0.94);
    ctx.quadraticCurveTo(w * 0.2, -len * 1.02, 0, -len * 1.0);
    ctx.quadraticCurveTo(-w * 0.2, -len * 1.02, -w * 0.5, -len * 0.94);
    ctx.closePath();
    ctx.fillStyle = COLORS.coat;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();

    // open front + shirt V
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, -len * 0.97);
    ctx.lineTo(0, -len * 0.66);
    ctx.lineTo(w * 0.22, -len * 0.97);
    ctx.closePath();
    ctx.fillStyle = COLORS.shirt;
    ctx.fill();

    // lapels
    ctx.beginPath();
    ctx.moveTo(-w * 0.26, -len * 0.99);
    ctx.lineTo(-w * 0.05, -len * 0.52);
    ctx.lineTo(-w * 0.3, -len * 0.58);
    ctx.closePath();
    ctx.fillStyle = COLORS.coatShade;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.26, -len * 0.99);
    ctx.lineTo(w * 0.05, -len * 0.52);
    ctx.lineTo(w * 0.3, -len * 0.58);
    ctx.closePath();
    ctx.fill();

    // tie
    ctx.beginPath();
    ctx.moveTo(-w * 0.07, -len * 0.9);
    ctx.lineTo(w * 0.07, -len * 0.9);
    ctx.lineTo(w * 0.1, -len * 0.34);
    ctx.lineTo(0, -len * 0.18);
    ctx.lineTo(-w * 0.1, -len * 0.34);
    ctx.closePath();
    ctx.fillStyle = COLORS.tie;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = outline * 0.5;
    ctx.stroke();
    // tie knot
    ctx.beginPath();
    ctx.moveTo(-w * 0.06, -len * 0.98);
    ctx.lineTo(w * 0.06, -len * 0.98);
    ctx.lineTo(0, -len * 0.88);
    ctx.closePath();
    ctx.fillStyle = "#c03f38";
    ctx.fill();

    // buttons
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(w * 0.3, -len * (0.66 - i * 0.18), 2.2 * s, 0, TAU);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
    }

    // breast pocket with pens
    roundRect(ctx, -w * 0.44, -len * 0.72, w * 0.28, len * 0.2, 4 * s);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -len * 0.72);
    ctx.lineTo(-w * 0.42, -len * 0.84);
    ctx.moveTo(-w * 0.28, -len * 0.72);
    ctx.lineTo(-w * 0.26, -len * 0.8);
    ctx.strokeStyle = "#3f7ad6";
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // name badge
    roundRect(ctx, w * 0.12, -len * 0.5, w * 0.26, len * 0.12, 3 * s);
    ctx.fillStyle = "rgba(120,170,255,0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // band-aids on the chest
    for (const b of this.bandaids.filter((x) => x.where === "chest")) {
      this._drawBandaid(ctx, b.u * w * 0.4, -len * b.v, b.rot, s);
    }

    ctx.restore();
  }

  _drawBandaid(ctx, x, y, rot, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    roundRect(ctx, -9 * s, -3.6 * s, 18 * s, 7.2 * s, 3 * s);
    ctx.fillStyle = "#f3d7b4";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,80,50,0.5)";
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.fillStyle = "#e8bf95";
    ctx.fillRect(-2.4 * s, -3.4 * s, 4.8 * s, 6.8 * s);
    ctx.restore();
  }

  _drawHead(ctx, outline) {
    const s = this.scale;
    const head = this.world.head;
    const R = this.B.headR * s;

    ctx.save();
    ctx.translate(head.wx, head.wy);
    ctx.rotate(head.wa);

    // neck
    roundRect(ctx, -9 * s, -12 * s, 18 * s, 16 * s, 6 * s);
    ctx.fillStyle = COLORS.skinShade;
    ctx.fill();

    const cx = 0;
    const cy = -this.B.headR * 0.95 * s;

    // ears
    ctx.beginPath();
    ctx.arc(cx - R * 0.94, cy + R * 0.08, R * 0.22, 0, TAU);
    ctx.arc(cx + R * 0.94, cy + R * 0.08, R * 0.22, 0, TAU);
    ctx.fillStyle = COLORS.skin;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();

    // head base
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 1.03, 0, 0, TAU);
    ctx.fillStyle = COLORS.skin;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = outline;
    ctx.stroke();

    // hair — swept white fringe with a cheeky cowlick
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.99, cy + R * 0.02);
    ctx.bezierCurveTo(cx - R * 1.05, cy - R * 0.72, cx - R * 0.62, cy - R * 1.02, cx - R * 0.02, cy - R * 1.02);
    ctx.bezierCurveTo(cx + R * 0.6, cy - R * 1.02, cx + R * 1.05, cy - R * 0.7, cx + R * 0.99, cy + R * 0.04);
    // inner edge: temples then a swept fringe with tips
    ctx.quadraticCurveTo(cx + R * 0.94, cy - R * 0.26, cx + R * 0.8, cy - R * 0.28);
    ctx.quadraticCurveTo(cx + R * 0.74, cy - R * 0.56, cx + R * 0.44, cy - R * 0.5);
    ctx.quadraticCurveTo(cx + R * 0.22, cy - R * 0.46, cx + R * 0.12, cy - R * 0.62);
    ctx.quadraticCurveTo(cx - R * 0.06, cy - R * 0.44, cx - R * 0.28, cy - R * 0.6);
    ctx.quadraticCurveTo(cx - R * 0.46, cy - R * 0.4, cx - R * 0.62, cy - R * 0.44);
    ctx.quadraticCurveTo(cx - R * 0.8, cy - R * 0.4, cx - R * 0.86, cy - R * 0.1);
    ctx.quadraticCurveTo(cx - R * 0.94, cy - R * 0.02, cx - R * 0.99, cy + R * 0.02);
    ctx.closePath();
    const hairGrad = ctx.createLinearGradient(cx, cy - R * 1.0, cx, cy - R * 0.2);
    hairGrad.addColorStop(0, "#ffffff");
    hairGrad.addColorStop(1, "#dbe1ee");
    ctx.fillStyle = hairGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(74,84,108,0.5)";
    ctx.lineWidth = outline * 0.45;
    ctx.stroke();

    // cowlick
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.42, cy - R * 0.96);
    ctx.quadraticCurveTo(cx - R * 0.6, cy - R * 1.24, cx - R * 0.24, cy - R * 1.18);
    ctx.quadraticCurveTo(cx - R * 0.34, cy - R * 1.05, cx - R * 0.2, cy - R * 0.96);
    ctx.closePath();
    ctx.fillStyle = "#f2f5fb";
    ctx.fill();

    // strand detail
    ctx.strokeStyle = "rgba(126,136,160,0.35)";
    ctx.lineWidth = Math.max(1, R * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.6, cy - R * 0.78);
    ctx.quadraticCurveTo(cx - R * 0.2, cy - R * 0.94, cx + R * 0.24, cy - R * 0.84);
    ctx.moveTo(cx - R * 0.5, cy - R * 0.6);
    ctx.quadraticCurveTo(cx - R * 0.1, cy - R * 0.76, cx + R * 0.5, cy - R * 0.66);
    ctx.stroke();
    ctx.restore();

    if (this.faceImage) {
      this._drawFaceImage(ctx, cx, cy, R);
    } else {
      this._drawCartoonFace(ctx, cx, cy, R, s);
    }

    // blush
    if (this.expression === "rage" || this.stun > 0) {
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.55, cy + R * 0.3, R * 0.2, R * 0.12, 0, 0, TAU);
      ctx.ellipse(cx + R * 0.55, cy + R * 0.3, R * 0.2, R * 0.12, 0, 0, TAU);
      ctx.fillStyle = COLORS.blush;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // band-aids on the face
    for (const b of this.bandaids.filter((x) => x.where === "head")) {
      this._drawBandaid(ctx, cx + b.u * R * 0.8, cy + (b.v - 0.5) * R * 1.1, b.rot, s);
    }

    ctx.restore();
  }

  _drawFaceImage(ctx, cx, cy, R) {
    const meta = this.faceMeta || {};
    const scale = meta.scale || 1;
    const img = this.faceImage;
    const side = (R * 2.02) / scale;
    const dx = (meta.offsetX || 0) * R;
    const dy = (meta.offsetY || 0) * R;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.98, R * 1.01, 0, 0, TAU);
    ctx.closePath();
    ctx.clip();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(meta.rotate || 0);
    if (img && img.complete !== false && (img.naturalWidth || img.width)) {
      ctx.drawImage(img, -side / 2, -side / 2, side, side);
    } else {
      ctx.fillStyle = COLORS.skinShade;
      ctx.fillRect(-side, -side, side * 2, side * 2);
    }
    // subtle vignette so photos blend into the cartoon body
    const grad = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 1.05);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(40,20,10,0.32)");
    ctx.fillStyle = grad;
    ctx.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.98, R * 1.01, 0, 0, TAU);
    ctx.strokeStyle = "rgba(42,28,21,0.85)";
    ctx.lineWidth = Math.max(2, R * 0.07);
    ctx.stroke();
  }

  _drawCartoonFace(ctx, cx, cy, R, s) {
    const expr = this.expression;
    const ko = expr === "ko";
    const dizzy = expr === "dizzy" || this.stun > 0;
    const hurt = expr === "hurt" || expr === "annoyed" || expr === "rage";
    const blinkAmt = this.blink > 0 ? 1 : 0;
    const lookX = this.lookAt.x * R * 0.09;
    const lookY = this.lookAt.y * R * 0.07;

    // eyebrows
    ctx.strokeStyle = COLORS.hairShade;
    ctx.lineWidth = R * 0.1;
    ctx.lineCap = "round";
    const browY = cy - R * 0.36;
    ctx.beginPath();
    if (hurt || dizzy) {
      ctx.moveTo(cx - R * 0.55, browY - R * 0.06);
      ctx.lineTo(cx - R * 0.2, browY + R * 0.05);
      ctx.moveTo(cx + R * 0.55, browY - R * 0.06);
      ctx.lineTo(cx + R * 0.2, browY + R * 0.05);
    } else {
      ctx.moveTo(cx - R * 0.56, browY);
      ctx.quadraticCurveTo(cx - R * 0.38, browY - R * 0.12, cx - R * 0.18, browY);
      ctx.moveTo(cx + R * 0.56, browY);
      ctx.quadraticCurveTo(cx + R * 0.38, browY - R * 0.12, cx + R * 0.18, browY);
    }
    ctx.stroke();

    // eyes
    const eyeY = cy - R * 0.1;
    const eyeDX = R * 0.34;
    if (ko) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = R * 0.075;
      for (const dir of [-1, 1]) {
        const ex = cx + dir * eyeDX;
        const r2 = R * 0.16;
        ctx.beginPath();
        ctx.moveTo(ex - r2, eyeY - r2);
        ctx.lineTo(ex + r2, eyeY + r2);
        ctx.moveTo(ex + r2, eyeY - r2);
        ctx.lineTo(ex - r2, eyeY + r2);
        ctx.stroke();
      }
    } else if (dizzy) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = R * 0.055;
      for (const dir of [-1, 1]) {
        const ex = cx + dir * eyeDX;
        ctx.beginPath();
        for (let a = 0; a < 3.4; a += 0.22) {
          const rr = R * 0.03 + a * R * 0.045;
          const px = ex + Math.cos(a + this.time * 5) * rr;
          const py = eyeY + Math.sin(a + this.time * 5) * rr;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (hurt) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = R * 0.06;
      for (const dir of [-1, 1]) {
        const ex = cx + dir * eyeDX;
        ctx.beginPath();
        ctx.moveTo(ex - R * 0.12, eyeY + R * 0.08);
        ctx.lineTo(ex + R * 0.02, eyeY - R * 0.05);
        ctx.lineTo(ex + R * 0.14, eyeY + R * 0.08);
        ctx.stroke();
      }
    } else {
      // eye whites
      for (const dir of [-1, 1]) {
        const ex = cx + dir * eyeDX;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, R * 0.175, R * 0.205 * (1 - blinkAmt * 0.92), 0, 0, TAU);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "rgba(42,28,21,0.7)";
        ctx.lineWidth = R * 0.03;
        ctx.stroke();
        if (blinkAmt < 0.5) {
          ctx.beginPath();
          ctx.arc(ex + lookX, eyeY + lookY, R * 0.085, 0, TAU);
          ctx.fillStyle = COLORS.ink;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex + lookX - R * 0.025, eyeY + lookY - R * 0.03, R * 0.025, 0, TAU);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }
      }
    }

    // glasses
    const gy = eyeY - R * 0.02;
    const gw = R * 0.42;
    const gh = R * 0.38;
    ctx.save();
    for (const dir of [-1, 1]) {
      const gx = cx + dir * eyeDX;
      roundRect(ctx, gx - gw / 2, gy - gh / 2, gw, gh, R * 0.14);
      ctx.fillStyle = COLORS.lens;
      ctx.fill();
      ctx.strokeStyle = COLORS.glass;
      ctx.lineWidth = R * 0.065;
      ctx.stroke();
      // lens highlight
      ctx.beginPath();
      ctx.moveTo(gx - gw * 0.26, gy + gh * 0.18);
      ctx.lineTo(gx - gw * 0.02, gy - gh * 0.22);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = R * 0.04;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - eyeDX + gw / 2, gy - R * 0.02);
    ctx.quadraticCurveTo(cx, gy - R * 0.12, cx + eyeDX - gw / 2, gy - R * 0.02);
    ctx.strokeStyle = COLORS.glass;
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
    ctx.restore();

    // nose
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.03, cy + R * 0.16);
    ctx.quadraticCurveTo(cx + R * 0.16, cy + R * 0.3, cx + R * 0.02, cy + R * 0.34);
    ctx.strokeStyle = COLORS.skinLine;
    ctx.lineWidth = R * 0.045;
    ctx.stroke();

    // moustache
    ctx.beginPath();
    ctx.moveTo(cx, cy + R * 0.36);
    ctx.quadraticCurveTo(cx - R * 0.3, cy + R * 0.28, cx - R * 0.42, cy + R * 0.44);
    ctx.quadraticCurveTo(cx - R * 0.2, cy + R * 0.52, cx, cy + R * 0.44);
    ctx.quadraticCurveTo(cx + R * 0.2, cy + R * 0.52, cx + R * 0.42, cy + R * 0.44);
    ctx.quadraticCurveTo(cx + R * 0.3, cy + R * 0.28, cx, cy + R * 0.36);
    ctx.closePath();
    ctx.fillStyle = COLORS.hairShade;
    ctx.fill();
    ctx.strokeStyle = "rgba(60,45,35,0.5)";
    ctx.lineWidth = R * 0.02;
    ctx.stroke();

    // mouth
    const my = cy + R * 0.6;
    ctx.beginPath();
    if (ko) {
      ctx.ellipse(cx, my, R * 0.16, R * 0.22, 0, 0, TAU);
      ctx.fillStyle = "#7d2f36";
      ctx.fill();
      // tongue
      ctx.beginPath();
      ctx.ellipse(cx + R * 0.02, my + R * 0.12, R * 0.1, R * 0.08, 0, 0, TAU);
      ctx.fillStyle = "#e8757f";
      ctx.fill();
    } else if (hurt) {
      ctx.ellipse(cx, my, R * 0.17, R * 0.21, 0, 0, TAU);
      ctx.fillStyle = "#7d2f36";
      ctx.fill();
    } else {
      ctx.moveTo(cx - R * 0.2, my - R * 0.02);
      ctx.quadraticCurveTo(cx, my + R * 0.16, cx + R * 0.2, my - R * 0.02);
      ctx.strokeStyle = COLORS.skinLine;
      ctx.lineWidth = R * 0.055;
      ctx.stroke();
    }

    // sweat drops when hurt
    if (hurt && this.expressionTimer > 0.1) {
      ctx.beginPath();
      ctx.ellipse(cx + R * 0.8, cy - R * 0.35, R * 0.07, R * 0.11, 0.4, 0, TAU);
      ctx.fillStyle = "rgba(140,200,255,0.9)";
      ctx.fill();
    }
  }

  _drawImageDoll(ctx) {
    const img = this.dollImage;
    const meta = this.dollMeta || {};
    const height = (meta.height || 520) * this.scale * 0.72;
    const root = this.world.root;
    const pivotY = meta.pivotY ?? 0.5;
    ctx.save();
    ctx.translate(root.wx, root.wy + height * (0.5 - pivotY));
    if (img) {
      const ratio = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
      const width = height * ratio;
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(-height / 4, -height / 2, height / 2, height);
    }
    ctx.restore();
  }

  _drawStunStars(ctx) {
    const show = this.stun > 0 || this.expression === "dizzy" || this.expression === "ko";
    if (!show) return;
    const head = this.world?.head;
    if (!head) return;
    const R = this.B.headR * this.scale;
    const c = this._localToWorld(head, 0, -this.B.headR * 1.5);
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 3; i += 1) {
      const a = this.time * 3.2 + (i * TAU) / 3;
      const x = c.x + Math.cos(a) * R * 0.95;
      const y = c.y + Math.sin(a) * R * 0.34;
      this._star(ctx, x, y, R * 0.17, a);
    }
    ctx.restore();
  }

  _star(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = (i / 10) * TAU - Math.PI / 2;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd84d";
    ctx.fill();
    ctx.strokeStyle = "rgba(140,90,0,0.6)";
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.stroke();
    ctx.restore();
  }
}
