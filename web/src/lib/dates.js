import { t, i18n } from './i18n.svelte.js';

// Functions instead of constants, so they follow the current language
export const weekdays = () => t('date.weekdays');
export const weekdaysLong = () => t('date.weekdaysLong');
export const months = () => t('date.months');
export const slotLabel = (slot) => t(`slot.${slot}`);

// "10. November" / "10 November", or with short=true "10. Nov" / "10 Nov"
export function dayMonth(date, short = false) {
  const month = months()[date.getMonth()];
  const name = short ? month.slice(0, 3) : month;
  return i18n.lang === 'de' ? `${date.getDate()}. ${name}` : `${date.getDate()} ${name}`;
}

// Date -> "2026-11-09", in local time (not UTC!)
export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "2026-11-09" -> Date at local midnight
export function fromISO(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// 0 = Monday ... 6 = Sunday (JavaScript itself starts on Sunday)
export function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function startOfWeek(date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(day, -weekdayIndex(day));
}

export function todayISO() {
  return toISO(new Date());
}

// ISO calendar week number, shown like "KW 46"
export function weekNumber(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

// "2026-11-10" -> "Di, 10. Nov" / "Tu, 10 Nov"
export function formatShort(text) {
  const d = fromISO(text);
  return `${weekdays()[weekdayIndex(d)]}, ${dayMonth(d, true)}`;
}