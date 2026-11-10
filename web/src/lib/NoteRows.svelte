<script>
  import { tick } from 'svelte';
  import { t } from './i18n.svelte.js';

  // value is the stored note: one row per line
  let { id, value = $bindable(''), placeholder = '' } = $props();

  let rows = $state(value ? value.split('\n') : ['']);
  let inputs = $state([]);

  function sync() {
    value = rows.map((r) => r.trim()).filter(Boolean).join('\n');
  }

  async function addRow(after = rows.length - 1) {
    rows.splice(after + 1, 0, '');
    sync();
    await tick();
    inputs[after + 1]?.focus();
  }

  function removeRow(i) {
    rows.splice(i, 1);
    if (rows.length === 0) rows.push('');
    sync();
  }

  // Enter starts a new row instead of submitting the form
  function onkeydown(event, i) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addRow(i);
    }
  }
</script>

<div class="rows">
  {#each rows as _, i}
    <div class="row">
      <input
        id={i === 0 ? id : undefined}
        type="text"
        bind:this={inputs[i]}
        bind:value={rows[i]}
        oninput={sync}
        onkeydown={(e) => onkeydown(e, i)}
        placeholder={i === 0 ? placeholder : ''}
        maxlength="200"
      />
      {#if rows.length > 1}
        <button type="button" class="remove" aria-label={t('note.removeRow')} onclick={() => removeRow(i)}>✕</button>
      {/if}
    </div>
  {/each}
  <button type="button" class="ghost add" onclick={() => addRow()}>{t('note.addRow')}</button>
</div>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .row input { flex: 1; min-width: 0; }

  .remove {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .remove:hover { color: var(--error); }

  .add { align-self: flex-start; }
</style>
