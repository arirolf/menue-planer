<script>
  import { t } from './i18n.svelte.js';

  // − / number / +, whole numbers from 1 to 99
  let { value = $bindable(1) } = $props();

  const clamp = (n) => Math.min(99, Math.max(1, n));
</script>

<div class="stepper">
  <button type="button" onclick={() => (value = clamp(value - 1))} disabled={value <= 1} aria-label={t('stepper.less')}>−</button>
  <span class="value" aria-live="polite">{value}</span>
  <button type="button" onclick={() => (value = clamp(value + 1))} disabled={value >= 99} aria-label={t('stepper.more')}>+</button>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  button {
    width: 64px;
    height: 64px;
    border: 2px solid var(--tag);
    border-radius: 50%;
    background: var(--card);
    color: var(--text);
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
  }

  button:hover:not(:disabled) { border-color: var(--accent); }
  button:active:not(:disabled) { transform: scale(0.95); }
  button:disabled { opacity: 0.35; cursor: default; }

  .value {
    min-width: 2.5ch;
    text-align: center;
    font-size: 2.2rem;
    font-weight: 700;
  }
</style>
