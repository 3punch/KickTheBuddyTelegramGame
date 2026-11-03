import { test } from "node:test";
import assert from "node:assert/strict";
import { Doll } from "../web/js/doll.js";
import { WEAPONS } from "../web/js/content.js";
import { RIG_NAMES } from "../web/js/weaponry.js";

function makeDoll({ cutout = false } = {}) {
  const doll = new Doll();
  doll.resize(430, 780);
  if (cutout) {
    const image = { naturalWidth: 645, naturalHeight: 900, width: 645, height: 900, complete: true };
    doll.setDollImage(image, { height: 0.6, tip: 0.92 });
  }
  return doll;
}

test("dragging the doll keeps the grabbed point under the pointer, then flings it", () => {
  const doll = makeDoll();
  const grabbed = doll.shapes.find((shape) => shape.part === "torso");
  assert.ok(grabbed);
  const startX = doll.root.ox;
  const startY = doll.root.oy;

  doll.beginDrag(grabbed.x, grabbed.y);
  assert.equal(doll.dragging, true);
  doll.dragTo(grabbed.x + 90, grabbed.y - 48);
  assert.ok(doll.root.ox > startX + 70, "body follows a horizontal pull");
  assert.ok(doll.root.oy < startY - 30, "body follows a vertical pull");
  assert.equal(doll.ragdoll, true);

  doll.fling(920, -680);
  assert.equal(doll.dragging, false);
  assert.equal(doll.ragdoll, true);
  assert.equal(doll.root.vx, 920);
  assert.equal(doll.root.vy, -680);
  const before = doll.root.ox;
  doll.update(1 / 30);
  assert.ok(doll.root.ox > before, "released momentum carries the body forward");
});

test("cut-out plush hit shapes and drag pivot follow its foot-anchored artwork", () => {
  const doll = makeDoll({ cutout: true });
  const shape = doll.shapes.find((item) => item.part === "head");
  assert.ok(shape);
  doll.beginDrag(shape.x, shape.y);
  doll.dragTo(shape.x + 60, shape.y + 24);
  assert.ok(doll.root.ox > 0);
  assert.ok(doll.imageRect().footY > 0);
  doll.fling(700, 420);
  assert.equal(doll.dollImage !== null, true);
  assert.equal(doll.ragdoll, true);
});

test("injury marks progress from redness to a visible bruise and cartoon blood", () => {
  const doll = makeDoll();
  const shape = doll.shapes.find((item) => item.part === "torso");
  doll.hurt(100, shape, 1);
  assert.equal(doll.injuries.length, 1);
  assert.ok(doll.injuries[0].redness > 0, "first hit reddens the impact area");
  assert.equal(doll.injuries[0].bruise, false);

  doll.hurt(180, shape, 1);
  assert.equal(doll.injuries[0].bruise, true, "repeated damage develops a purple bruise");
  doll.hurt(180, shape, 1);
  assert.equal(doll.injuries[0].blood, true, "third hit adds a small stylised blood mark");
  assert.equal(doll.injuries[0].bloodBurst, true);
});

test("a heavy hit stains the cut-out plush at its transformed contact point", () => {
  const doll = makeDoll({ cutout: true });
  const shape = doll.shapes.find((item) => item.part === "head");
  const injury = doll.hurt(650, shape, 1.4, { heavy: true });
  assert.equal(injury.space, "image");
  assert.equal(injury.bruise, true);
  assert.equal(injury.blood, true);
  assert.ok(injury.u > 0 && injury.u < 1);
  assert.ok(injury.v > 0 && injury.v < 1);
});

test("the catalog has 24 drawable items, including the new classroom gear", () => {
  assert.equal(WEAPONS.length, 24);
  assert.equal(new Set(WEAPONS.map((weapon) => weapon.id)).size, 24);
  for (const id of ["paperplane", "eraser", "textbook", "chicken", "bell", "megaphone"]) {
    const weapon = WEAPONS.find((item) => item.id === id);
    assert.ok(weapon, `${id} is in the catalog`);
    assert.ok(RIG_NAMES.includes(weapon.rig), `${id} has a visible canvas rig`);
  }
});
