// Personal colors: "main" for buttons and highlights, "secondary" tints backgrounds.
// null = the default look from app.css.

const STORAGE_KEY = 'menu.colors';

// First entry is the default (stored as null); `show` is what the swatch looks like
export const MAIN_PRESETS = [
  { value: null, show: '#ff6b35' },
  { value: '#e63946', show: '#e63946' },
  { value: '#d6337a', show: '#d6337a' },
  { value: '#8e44ad', show: '#8e44ad' },
  { value: '#3366e6', show: '#3366e6' },
  { value: '#1a9aa0', show: '#1a9aa0' },
  { value: '#2e9d5b', show: '#2e9d5b' },
  { value: '#e0a100', show: '#e0a100' },
];

export const SECONDARY_PRESETS = [
  { value: null, show: '#e8d9c5' },
  { value: '#9aa5b1', show: '#9aa5b1' },
  { value: '#7da7d9', show: '#7da7d9' },
  { value: '#8cc7a1', show: '#8cc7a1' },
  { value: '#e5a3c0', show: '#e5a3c0' },
  { value: '#b39ddb', show: '#b39ddb' },
  { value: '#f2d16b', show: '#f2d16b' },
  { value: '#f4a582', show: '#f4a582' },
];

// Frame = the phone's status bar / browser bar (<meta name="theme-color">).
// null follows the main color; the swatch for it is filled in by the settings page.
export const FRAME_PRESETS = [
  { value: null, show: null },
  { value: '#ffffff', show: '#ffffff' },
  { value: '#faf7f2', show: '#faf7f2' },
  { value: '#1a1714', show: '#1a1714' },
  { value: '#e63946', show: '#e63946' },
  { value: '#3366e6', show: '#3366e6' },
  { value: '#2e9d5b', show: '#2e9d5b' },
  { value: '#8e44ad', show: '#8e44ad' },
];

const DEFAULT_MAIN = '#ff6b35';

export function frameColor(main, frame) {
  return frame ?? main ?? DEFAULT_MAIN;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// White text on dark colors, dark text on light ones (e.g. yellow)
function textOn(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? '#2b2420' : '#ffffff';
}

export function applyColors({
  color_main: main = null,
  color_secondary: secondary = null,
  color_frame: frame = null,
} = {}) {
  const style = document.documentElement.style;

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', frameColor(main, frame));

  if (main) {
    style.setProperty('--accent', main);
    style.setProperty('--accent-hover', `color-mix(in srgb, ${main} 82%, black)`);
    style.setProperty('--on-accent', textOn(main));
  } else {
    ['--accent', '--accent-hover', '--on-accent'].forEach((p) => style.removeProperty(p));
  }

  // Mixed into the normal light/dark values, so dark mode stays dark
  if (secondary) {
    style.setProperty('--bg', `color-mix(in srgb, ${secondary} 10%, var(--bg-base))`);
    style.setProperty('--tag', `color-mix(in srgb, ${secondary} 24%, var(--card))`);
  } else {
    ['--bg', '--tag'].forEach((p) => style.removeProperty(p));
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ color_main: main, color_secondary: secondary, color_frame: frame }));
  } catch {
    // not remembered on this device, the server still has it
  }
}

// On startup, before we know who is logged in: use this device's last colors
export function restoreColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) applyColors(saved);
  } catch {
    // nothing saved or broken value: default colors
  }
}
