import MESSAGES from './messages.js';

export const LANGUAGES = ['de', 'en'];
const STORAGE_KEY = 'menu.lang';

// Before login we don't know the user's setting yet,
// so use whatever this device used last time
function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    // private mode: fall through to the default
  }
  return 'de';
}

// Reactive: everything that calls t() updates when this changes
export const i18n = $state({ lang: initialLanguage() });
document.documentElement.lang = i18n.lang;

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) return;
  i18n.lang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not remembered on this device, still works for now
  }
}

// t('recipes.count', { n: 3, total: 10 }) -> "3 von 10 Rezepten"
// Falls back to German, then to the key itself, so a gap is visible but nothing breaks.
export function t(key, params) {
  const entry = MESSAGES[key];
  if (!entry && import.meta.env.DEV) console.warn(`Missing translation: ${key}`);
  const value = entry?.[i18n.lang] ?? entry?.de ?? key;
  if (!params || typeof value !== 'string') return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

// For toLocaleDateString and friends
export function locale() {
  return i18n.lang === 'en' ? 'en-GB' : 'de-CH';
}
