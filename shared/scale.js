// Scaling ingredient amounts to a different number of people.
// Used by both the server (adding to lists) and the web app (showing amounts),
// so this file must stay plain JavaScript with no imports.

// Every recipe is written for this many people
export const BASE_SERVINGS = 4;

// For these, each ingredient can store a hand-typed amount that wins over the calculation
export const PRESET_SERVINGS = [6, 8];

export const MAX_SERVINGS = 99;

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// One number: "1 1/2", "1/2", "1,5", "1.5", "1½", "½", "4"
const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?[½¼¾⅓⅔]?|[½¼¾⅓⅔]`;
// A number or a range like "2-3", followed by the rest ("g", " EL", "L", "")
const AMOUNT = new RegExp(String.raw`^\s*(${NUM})(?:\s*[-–]\s*(${NUM}))?(.*)$`);

// Measuring units can be split (1,5 dl). Anything else ("4" eggs, "½ Zitrone",
// "3 Zehen") is counted in pieces and rounded up to whole ones.
const MEASURES = /^(mg|g|gr|gramm|kg|ml|cl|dl|l|liter|el|tl|msp|cup|cups|tbsp|tsp|oz|lb)\b/i;

function parseNumber(text) {
  text = text.trim();
  let m = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = text.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = text.match(/^(\d+(?:[.,]\d+)?)?([½¼¾⅓⅔])?$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
}

// Round to something you'd actually measure: 0.25 TL, 1.5 EL, 33 g, 375 g
function roundNicely(value, wholePieces) {
  if (wholePieces) return Math.max(1, Math.ceil(value - 1e-9));
  const step = value < 1 ? 0.25 : value < 10 ? 0.5 : value < 100 ? 1 : 5;
  return Math.max(step, Math.round(value / step) * step);
}

function formatNumber(value, decimal) {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return text.replace('.', decimal);
}

// scaleAmount("300 g", 1.5) -> "450 g". Text without a leading number stays as it is.
export function scaleAmount(amount, factor, { decimal = ',' } = {}) {
  if (!amount || factor === 1) return amount ?? null;
  const m = amount.match(AMOUNT);
  if (!m) return amount;

  const [, first, second, rest] = m;
  const wholePieces = !MEASURES.test(rest.trim());
  const scale = (text) => formatNumber(roundNicely(parseNumber(text) * factor, wholePieces), decimal);

  if (Number.isNaN(parseNumber(first)) || (second && Number.isNaN(parseNumber(second)))) return amount;
  return second ? `${scale(first)}-${scale(second)}${rest}` : `${scale(first)}${rest}`;
}

// The calculated amount, ignoring hand-typed ones (used as the suggestion in the editor)
export function suggestedAmount(amount, servings, options) {
  return scaleAmount(amount, servings / BASE_SERVINGS, options);
}

// The amount to actually use for an ingredient { amount, amount_6, amount_8 }
export function amountFor(ingredient, servings, options) {
  if (servings === BASE_SERVINGS) return ingredient.amount ?? null;
  const own = PRESET_SERVINGS.includes(servings) ? ingredient[`amount_${servings}`] : null;
  return own || suggestedAmount(ingredient.amount, servings, options);
}

export function isValidServings(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SERVINGS;
}
