<script>
  import {
    BASE_SERVINGS,
    PRESET_SERVINGS,
    MAX_SERVINGS,
    isValidServings,
  } from '../../../shared/scale.js';
  import { t } from './i18n.svelte.js';

  let { servings = $bindable(BASE_SERVINGS) } = $props();

  const CHOICES = [BASE_SERVINGS, ...PRESET_SERVINGS];

  // Typed-in number of people; null while the field is empty
  let custom = $state(null);
  let usingCustom = $derived(custom != null && custom !== '');

  function pick(n) {
    custom = null;
    servings = n;
  }

  function typed() {
    if (!usingCustom) servings = BASE_SERVINGS;
    else if (isValidServings(custom)) servings = custom;
  }
</script>

<div class="servings">
  <span class="label">{t('servings.label')}</span>
  <div class="chips">
    {#each CHOICES as n}
      <button type="button" class="chip" class:active={!usingCustom && servings === n} onclick={() => pick(n)}>
        {n}
      </button>
    {/each}
    <input
      type="number"
      inputmode="numeric"
      min="1"
      max={MAX_SERVINGS}
      placeholder={t('servings.custom')}
      bind:value={custom}
      oninput={typed}
      class:active={usingCustom}
      aria-label={t('servings.customLabel')}
    />
  </div>
</div>

<style>
  .servings { margin-bottom: 16px; }

  .chip { min-width: 48px; }

  input {
    width: 90px;
    font: inherit;
    font-size: 0.95rem;
    padding: 8px 12px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    outline: none;
    text-align: center;
  }
  input:focus { border-color: var(--accent); }
  input.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
</style>
