/* Game content: weapons + upgrades. Shared by the engine and the UI. */

export const WEAPONS = [
  {
    id: "kick",
    name: "Kick",
    names: {"ar": "رفسة", "de": "Tritt", "es": "Patada"},
    emoji: "👟",
    damage: 95,
    cooldown: 330,
    price: 0,
    style: "kick",
    sound: "kick",
    knock: 1.1,
    tip: "The classic. Reliable, free, satisfying.",
  },
  {
    id: "punch",
    name: "Punch",
    names: {"ar": "لكمة", "de": "Faustschlag", "es": "Puñetazo"},
    emoji: "👊",
    damage: 68,
    cooldown: 190,
    price: 0,
    style: "punch",
    sound: "punch",
    knock: 0.7,
    tip: "Fast jabs. Great for building combos.",
  },
  {
    id: "slap",
    name: "Slap",
    names: {"ar": "كف", "de": "Ohrfeige", "es": "Bofetada"},
    emoji: "🖐️",
    damage: 58,
    cooldown: 150,
    price: 220,
    style: "slap",
    sound: "slap",
    knock: 0.45,
    tip: "Rapid-fire disrespect.",
  },
  {
    id: "flipflop",
    name: "Flip-flop",
    names: {"ar": "شبشب", "de": "Latschen", "es": "Chancla"},
    emoji: "🩴",
    damage: 130,
    cooldown: 400,
    price: 650,
    style: "swing",
    sound: "slap",
    knock: 1.3,
    tip: "Mum's favourite disciplinary tool.",
  },
  {
    id: "ruler",
    name: "Ruler",
    names: {"ar": "مسطرة", "de": "Lineal", "es": "Regla"},
    emoji: "📏",
    damage: 175,
    cooldown: 560,
    price: 1500,
    style: "swing",
    sound: "whack",
    knock: 1.5,
    tip: "32 centimetres of pure authority.",
  },
  {
    id: "bat",
    name: "Cricket bat",
    names: {"ar": "مضرب", "de": "Schlagholz", "es": "Bate"},
    emoji: "🏏",
    damage: 265,
    cooldown: 760,
    price: 3200,
    style: "swing",
    sound: "bat",
    knock: 2.4,
    tip: "Swing hard. Send him to the boundary.",
  },
  {
    id: "pan",
    name: "Frying pan",
    names: {"ar": "مقلاة", "de": "Bratpfanne", "es": "Sartén"},
    emoji: "🍳",
    damage: 340,
    cooldown: 900,
    price: 5600,
    style: "swing",
    sound: "clang",
    knock: 2.1,
    stun: 1.2,
    tip: "Clang! Stuns him for a moment.",
  },
  {
    id: "taser",
    name: "Taser",
    names: {"ar": "صاعق", "de": "Taser", "es": "Táser"},
    emoji: "⚡",
    damage: 430,
    cooldown: 1200,
    price: 9500,
    style: "zap",
    sound: "zap",
    knock: 1.8,
    stun: 1.5,
    tip: "Electric. Makes his hair stand up.",
  },
  {
    id: "bomb",
    name: "Chalk bomb",
    names: {"ar": "قنبلة", "de": "Kreidebombe", "es": "Bomba de tiza"},
    emoji: "💣",
    damage: 900,
    cooldown: 4200,
    price: 18000,
    style: "boom",
    sound: "boom",
    knock: 4.5,
    stun: 2,
    tip: "One big boom. Long cooldown.",
  },
];

/** Localised weapon label with English fallback. */
export function weaponLabel(weapon, lang) {
  const code = String(lang || "en").slice(0, 2);
  return weapon.names?.[code] || weapon.name;
}

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export const UPGRADES = [
  {
    id: "power",
    name: "Power",
    emoji: "💪",
    desc: "+8% damage per level",
    max: 10,
    baseCost: 900,
    growth: 1.75,
  },
  {
    id: "crit",
    name: "Critical hits",
    emoji: "🎯",
    desc: "+3% chance of a 2.5× hit",
    max: 10,
    baseCost: 1200,
    growth: 1.8,
  },
  {
    id: "coins",
    name: "Coin bonus",
    emoji: "🪙",
    desc: "+10% coins earned",
    max: 10,
    baseCost: 800,
    growth: 1.7,
  },
  {
    id: "tough",
    name: "Toughness",
    emoji: "🛡️",
    desc: "+200 max HP per level",
    max: 10,
    baseCost: 700,
    growth: 1.65,
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upgradeCost(def, level) {
  if (level >= def.max) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.growth, level));
}

export const BUILTIN_VOICES = [
  { id: "professor", name: "The Professor", pitch: 0.78, rate: 0.92, emoji: "🎩" },
  { id: "grumpy", name: "Grumpy Dean", pitch: 0.62, rate: 0.82, emoji: "😤" },
  { id: "squeaky", name: "Squeaky Freshman", pitch: 1.45, rate: 1.18, emoji: "🐭" },
  { id: "robot", name: "Lab Robot", pitch: 1.05, rate: 0.7, emoji: "🤖" },
];

export const BUILTIN_BACKGROUNDS = [{ id: "classroom", name: "Night Classroom", builtin: true }];

export const BUILTIN_FACES = [{ id: "cartoon", name: "Cartoon Professor", builtin: true }];

/** Coin reward from a round of damage. */
export function coinReward(damage, coinBonusLevel = 0, koBonus = 0) {
  const base = Math.floor(damage / 12);
  const bonus = 1 + coinBonusLevel * 0.1;
  return Math.max(1, Math.round(base * bonus)) + koBonus;
}
