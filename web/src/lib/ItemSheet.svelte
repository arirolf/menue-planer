<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import QuantityStepper from './QuantityStepper.svelte';

  // Count and note of one list item. onsaved(changes) gets the fields that were saved.
  let { listId, item, onclose, onsaved } = $props();

  // Start values only: the sheet is created fresh for every item
  // svelte-ignore state_referenced_locally
  let quantity = $state(item.quantity ?? 1);
  // svelte-ignore state_referenced_locally
  let note = $state(item.note ?? '');
  let saving = $state(false);
  let error = $state('');

  async function save(event) {
    event.preventDefault();
    const changes = {};
    if (quantity !== (item.quantity ?? 1)) changes.quantity = quantity;
    const cleanNote = note.trim();
    if (cleanNote !== (item.note ?? '')) changes.note = cleanNote;
    if (Object.keys(changes).length === 0) return onclose();

    saving = true;
    error = '';
    try {
      const res = await fetch(`/api/lists/${listId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error();
      onsaved({ ...changes, ...(changes.note !== undefined ? { note: cleanNote || null } : {}) });
    } catch {
      error = t('common.notSaved');
    } finally {
      saving = false;
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 250 }}>
  <h2>
    {#if item.amount}<span class="amount">{item.amount}</span>{/if}
    {item.name}
  </h2>
  {#if item.recipe_name}<p class="sub">🍽️ {item.recipe_name}</p>{/if}

  <div class="field">
    <span class="label">{t('item.count')}</span>
    <QuantityStepper bind:value={quantity} />
  </div>

  <div class="field">
    <label class="label" for="item-note">{t('item.note')}</label>
    <textarea id="item-note" bind:value={note} maxlength="300" rows="3" placeholder={t('item.notePlaceholder')}></textarea>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="sheet-actions">
    <button type="button" class="ghost" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? t('common.saving') : t('common.save')}
    </button>
  </div>
</form>

<style>
  .amount {
    color: var(--muted);
    font-weight: 400;
    margin-right: 6px;
  }

  textarea { width: 100%; }
  .ghost,
  .btn-primary { min-height: 52px; }
  .error { text-align: center; }
</style>
