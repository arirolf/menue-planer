<script>
  import { slide } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import { hexToRgb, rgbToHex } from './theme.js';

  // value: "#rrggbb" or null (= default). onpick gets called with the new value.
  let { label, hint, value, presets, disabled = false, onpick } = $props();

  let showSliders = $state(false);
  let rgb = $state([0, 0, 0]);

  let current = $derived(value ?? presets[0].show);
  let isPreset = $derived(presets.some((p) => p.value === value));
  let preview = $derived(rgbToHex(rgb));

  function toggleSliders() {
    showSliders = !showSliders;
    if (showSliders) rgb = hexToRgb(current);
  }

  function apply() {
    onpick(preview);
    showSliders = false;
  }

  const CHANNELS = ['settings.red', 'settings.green', 'settings.blue'];
</script>

<div class="picker">
  <span class="label">{label}</span>
  {#if hint}<p class="hint">{hint}</p>{/if}

  <div class="swatches">
    {#each presets as p, i}
      <button
        type="button"
        class="swatch"
        class:active={p.value === value}
        style="--c: {p.show}"
        {disabled}
        onclick={() => onpick(p.value)}
        aria-label={i === 0 ? t('settings.default') : p.show}
        title={i === 0 ? t('settings.default') : p.show}
      ></button>
    {/each}
  </div>

  <button
    type="button"
    class="custom-btn"
    class:active={!isPreset}
    {disabled}
    onclick={toggleSliders}
  >
    {#if !isPreset}<span class="dot" style="--c: {current}"></span>{/if}
    {t('settings.customColor')} {showSliders ? '▲' : '▼'}
  </button>

  {#if showSliders}
    <div class="sliders" transition:slide={{ duration: 180 }}>
      {#each CHANNELS as key, i}
        <label class="channel">
          <span class="name">{t(key)}</span>
          <input
            type="range"
            min="0"
            max="255"
            bind:value={rgb[i]}
            style="--track: linear-gradient(to right, {rgbToHex(rgb.map((v, j) => (j === i ? 0 : v)))}, {rgbToHex(rgb.map((v, j) => (j === i ? 255 : v)))})"
          />
          <span class="num">{rgb[i]}</span>
        </label>
      {/each}

      <div class="apply-row">
        <span class="preview" style="--c: {preview}"></span>
        <code>{preview}</code>
        <button type="button" class="btn-primary small" {disabled} onclick={apply}>
          {t('settings.apply')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .picker + :global(.picker) {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--tag);
  }

  .hint {
    margin: -4px 0 10px;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 8px;
  }

  .swatch {
    aspect-ratio: 1;
    width: 100%;
    max-width: 40px;
    border: 3px solid var(--card);
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 2px var(--tag);
    cursor: pointer;
    transition: transform 0.15s;
  }
  .swatch:hover { transform: scale(1.1); }
  .swatch.active { box-shadow: 0 0 0 3px var(--text); }

  .custom-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 6px 14px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .custom-btn.active { border-color: var(--text); }

  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--c);
  }

  .sliders {
    margin-top: 12px;
    padding: 14px;
    border-radius: 14px;
    background: var(--bg);
  }

  .channel {
    display: grid;
    grid-template-columns: 44px 1fr 36px;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    font-size: 0.85rem;
  }
  .name { color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  input[type='range'] {
    width: 100%;
    height: 14px;
    border-radius: 999px;
    background: var(--track);
    appearance: none;
    outline: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 22px;
    border: 3px solid white;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 3px solid white;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .apply-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
  }
  .preview {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--c);
    box-shadow: 0 0 0 2px var(--tag);
  }
  code { flex: 1; font-size: 0.95rem; }
  .small { padding: 10px 20px; font-size: 1rem; }
</style>
