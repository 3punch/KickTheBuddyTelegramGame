/* Persistent player profile: coins, unlocks, cosmetics, settings. */

import { cloudGet, cloudSet } from "./telegram.js";
import { UPGRADE_BY_ID } from "./content.js";

const KEY = "ktp.save.v1";
const CLOUD_KEY = "ktp-save-v1";

const defaults = () => ({
  v: 1,
  coins: 250,
  owned: ["kick", "punch", "slap"].filter(() => false).concat(["kick", "punch"]),
  equipped: "kick",
  upgrades: { power: 0, crit: 0, coins: 0, tough: 0 },
  cosmetics: {
    background: "classroom",
    face: "cartoon",
    doll: null,
    voice: "builtin:professor",
    voicePitch: 1,
  },
  customAssets: { background: null, face: null, doll: null },
  settings: {
    sound: true,
    music: true,
    haptics: true,
    damageNumbers: true,
    lang: "auto",
    reduceGlow: false,
  },
  stats: {
    bestRound: 0,
    bestCombo: 0,
    totalDamage: 0,
    kos: 0,
    rounds: 0,
  },
  seen: { intro: false, shop: false },
});

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      base[key] = deepMerge(base[key] && typeof base[key] === "object" ? base[key] : {}, value);
    } else if (value !== undefined && value !== null) {
      base[key] = value;
    }
  }
  return base;
}

export class Store {
  constructor() {
    this.state = defaults();
    this.listeners = new Set();
    this.saveTimer = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.isFresh = !raw;
      if (raw) this.state = deepMerge(defaults(), JSON.parse(raw));
    } catch {
      /* corrupted save -> defaults */
      this.isFresh = true;
    }
    return this.state;
  }

  async loadCloud() {
    try {
      const raw = await cloudGet(CLOUD_KEY);
      if (!raw) return false;
      const remote = JSON.parse(raw);
      const local = JSON.parse(localStorage.getItem(KEY) || "null");
      // Prefer the richer save (more total damage) between cloud and device.
      const remoteWins = !local || (remote?.stats?.totalDamage || 0) > (local?.stats?.totalDamage || 0);
      if (remoteWins) {
        this.state = deepMerge(defaults(), remote);
        this.save(true);
        this.emit();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  save(skipCloud = false) {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* storage full / private mode */
    }
    if (skipCloud) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      cloudSet(CLOUD_KEY, JSON.stringify(this.state)).catch(() => {});
    }, 2500);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (error) {
        console.error(error);
      }
    }
  }

  commit() {
    this.save();
    this.emit();
  }

  /* ── economy ─────────────────────────────────────────────────────────── */

  get coins() {
    return this.state.coins;
  }

  addCoins(amount) {
    const value = Math.max(0, Math.round(amount));
    this.state.coins = Math.max(0, this.state.coins + value);
    this.commit();
    return this.state.coins;
  }

  spend(amount) {
    const value = Math.max(0, Math.round(amount));
    if (this.state.coins < value) return false;
    this.state.coins -= value;
    this.commit();
    return true;
  }

  owns(id) {
    return this.state.owned.includes(id);
  }

  unlockWeapon(id) {
    if (!this.state.owned.includes(id)) this.state.owned.push(id);
    this.commit();
  }

  equip(id) {
    this.state.equipped = id;
    this.commit();
  }

  upgradeLevel(id) {
    return this.state.upgrades[id] || 0;
  }

  setUpgrade(id, level) {
    this.state.upgrades[id] = level;
    this.commit();
  }

  /* ── cosmetics ───────────────────────────────────────────────────────── */

  setCosmetic(slot, value) {
    this.state.cosmetics[slot] = value;
    this.commit();
  }

  setCustomAsset(slot, dataUrl) {
    this.state.customAssets[slot] = dataUrl;
    this.commit();
  }

  /* ── settings ────────────────────────────────────────────────────────── */

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.commit();
  }

  setStat(key, value) {
    this.state.stats[key] = value;
  }

  recordRound({ damage, combo, ko }) {
    const stats = this.state.stats;
    stats.totalDamage += Math.round(damage);
    stats.bestRound = Math.max(stats.bestRound, Math.round(damage));
    stats.bestCombo = Math.max(stats.bestCombo, Math.round(combo));
    stats.rounds += 1;
    if (ko) stats.kos += 1;
    this.save();
  }

  reset() {
    this.state = defaults();
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
    cloudSet(CLOUD_KEY, JSON.stringify(this.state)).catch(() => {});
    this.emit();
  }

  /* ── derived ─────────────────────────────────────────────────────────── */

  get damageMultiplier() {
    return 1 + this.upgradeLevel("power") * 0.08;
  }

  get critChance() {
    return this.upgradeLevel("crit") * 0.03;
  }

  get maxHp() {
    return 1000 + this.upgradeLevel("tough") * 200;
  }

  get coinMultiplier() {
    return 1 + this.upgradeLevel("coins") * 0.1;
  }

  nextUpgradeCost(id) {
    const def = UPGRADE_BY_ID[id];
    if (!def) return Infinity;
    return Math.round(def.baseCost * Math.pow(def.growth, this.upgradeLevel(id)));
  }
}

export const store = new Store();
