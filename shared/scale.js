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

// ---------- Changing one amount by hand with +/- ----------

const near = (a, b) => Math.abs(a - b) < 1e-6;

// How far one +/- press moves an amount. Decided once from the starting amount,
// so "½ Zitrone" keeps going ½ -> 1 -> 1½ instead of switching to whole steps.
// Halves/quarters/thirds (written as fractions, or pieces like "0,5 Zitrone") step by
// that fraction, other amounts below 1 ("0,3 dl") by 0.1, amounts from 20 up by their
// first digit (300 g -> 400 g), everything else by 1.
// null when there's no number to change ("etwas", empty).
export function amountStep(amount) {
  const m = amount?.match(AMOUNT);
  if (!m) return null;
  const value = parseNumber(m[1]);
  if (Number.isNaN(value)) return null;

  const fraction = value % 1;
  const written = /[½¼¾⅓⅔/]/.test(m[1]);
  const piece = !MEASURES.test(m[3].trim());
  let size = value < 1 && fraction > 0 ? 0.1 : 1;
  // From 20 up the step follows the current amount on every press (see bigStep)
  let big = value >= 20;
  if (written || piece) {
    let own = null;
    if (near(fraction, 0.5)) own = 0.5;
    else if (near(fraction, 0.25) || near(fraction, 0.75)) own = 0.25;
    else if (near(fraction, 1 / 3) || near(fraction, 2 / 3)) own = 1 / 3;
    if (own) {
      size = own;
      big = false;
    }
  }
  if (big) size = bigStep(value, 1);
  // Fractions stay fractions (1½), everything else uses decimals
  return { size, big, fractions: written || (piece && size < 1 && size !== 0.1) };
}

// Step for amounts from 20 up: between 100 and 300 by 50
// (100 -> 150 -> 200 -> 250 -> 300 and back), otherwise the first digit changes
// (20 -> 30, 300 -> 400, 1500 -> 2500), going down below 100: 100 -> 90.
function bigStep(value, direction) {
  if (direction > 0 ? value >= 100 && value < 300 : value > 100 && value <= 300) return 50;
  // Going down, look at the amount just below so 1000 -> 900 and 100 -> 90
  const v = direction < 0 ? value - 1e-6 : value;
  if (v < 20) return 10;
  return 10 ** Math.floor(Math.log10(v));
}

function formatStepped(value, fractions, decimal) {
  if (fractions) {
    const whole = Math.floor(value + 1e-6);
    const rest = value - whole;
    if (near(rest, 0)) return String(whole);
    const char = Object.keys(FRACTIONS).find((c) => near(FRACTIONS[c], rest));
    if (char) return `${whole || ''}${char}`;
  }
  return formatNumber(Number(value.toFixed(2)), decimal);
}

// stepAmount("½ Zitrone", +1, amountStep("½ Zitrone")) -> "1 Zitrone"
// Ranges ("2-3") move both ends. Returns the amount unchanged if it can't
// go lower without reaching 0.
export function stepAmount(amount, direction, step, { decimal = ',' } = {}) {
  const m = amount?.match(AMOUNT);
  if (!m || !step) return amount;
  const [, first, second, rest] = m;
  const values = [first, second].filter(Boolean).map(parseNumber);
  if (values.some(Number.isNaN)) return amount;

  const size = step.big ? bigStep(values[0], direction) : step.size;
  const moved = values.map((v) => v + direction * size);
  if (moved.some((v) => v < size - 1e-6)) return amount;
  const text = moved.map((v) => formatStepped(v, step.fractions, decimal)).join('-');
  return `${text}${rest}`;
}
