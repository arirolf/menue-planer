import { t } from './i18n.svelte.js';

export const TIME_LABELS = [
  '',
  '0–10 min',
  '10–20 min',
  '20–30 min',
  '30–40 min',
  '40–60 min',
  '60+ min',
];

// Difficulty 1-3 = knives, 4 = "Sonntagsessen" (all day, special occasions).
// Long texts are translated: t('recipe.difficulty')[level]
export const DIFFICULTIES = [1, 2, 3, 4];
export const SPECIAL = 4;

export function effortLabel(level) {
  return level === SPECIAL ? t('effort.special') : '🔪'.repeat(level);
}
