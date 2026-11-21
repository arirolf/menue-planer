<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import QuantityStepper from './QuantityStepper.svelte';

  // householdId: whose Basics; listId: the open list items get added to
  let { householdId, listId, onclose, onadded } = $props();

  let basics = $state([]);
  let loading = $state(true);
  let error = $state('');
  let message = $state('');
  let search = $state('');

  // Row waiting for "how many?"
  let picking = $state(null);
  let quantity = $state(1);
  let adding = $state(false);

  // Form for a new Basic ('new') or one being edited (its id); null = closed
  let editing = $state(null);
  let form = $state({ name: '', default_amount: '', barcode: '' });
  let saving = $state(false);

  let shown = $derived.by(() => {
    const q = search.trim().toLocaleLowerCase();
    return q ? basics.filter((b) => b.name.toLocaleLowerCase().includes(q)) : basics;
  });

  async function load() {
    try {
      const res = await fetch(`/api/households/${householdId}/basics`);
      if (!res.ok) throw new Error();
      basics = await res.json();
    } catch {
      error = t('basics.loadFailed');
    } finally {
      loading = false;
    }
  }

  function pick(basic) {
    editing = null;
    message = '';
    picking = picking?.id === basic.id ? null : basic;
    quantity = 1;
  }

  async function add() {
    if (!picking || adding) return;
    adding = true;
    error = '';
    try {
      const res = await fetch(`/api/lists/${listId}/items/from-basic/${picking.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) throw new Error();
      message = t('basics.added', { n: quantity, name: picking.name });
      picking.times_added++;
      picking = null;
      onadded?.();
    } catch {
      error = t('common.notSaved');
    } finally {
      adding = false;
    }
  }

  function startNew() {
    picking = null;
    message = '';
    editing = editing === 'new' ? null : 'new';
    form = { name: search.trim(), default_amount: '', barcode: '' };
  }

  function startEdit(basic) {
    picking = null;
    message = '';
    editing = basic.id;
    form = { name: basic.name, default_amount: basic.default_amount ?? '', barcode: basic.barcode ?? '' };
  }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim() || saving) return;
    const barcode = form.barcode.replace(/\s/g, '');
    if (barcode && !/^\d{6,14}$/.test(barcode)) {
      error = t('basics.barcodeInvalid');
      return;
    }
    saving = true;
    error = '';
    try {
      const isNew = editing === 'new';
      const res = await fetch(isNew ? `/api/households/${householdId}/basics` : `/api/basics/${editing}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, default_amount: form.default_amount, barcode: barcode || null }),
      });
      if (res.status === 409) throw new Error(t('basics.barcodeTaken'));
      if (!res.ok) throw new Error(t('common.notSaved'));
      editing = null;
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function remove(basic) {
    if (!confirm(t('common.confirmDelete', { name: basic.name }))) return;
    try {
      const res = await fetch(`/api/basics/${basic.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error();
      basics = basics.filter((b) => b.id !== basic.id);
      if (editing === basic.id) editing = null;
    } catch {
      error = t('common.deleteFailed');
    }
  }

  load();
</script>

{#snippet basicForm()}
  <form class="basic-form" onsubmit={save}>
    <input type="text" bind:value={form.name} placeholder={t('basics.name')} maxlength="100" required />
    <div class="form-row">
      <input type="text" bind:value={form.default_amount} placeholder={t('basics.amount')} maxlength="30" />
      <input type="text" inputmode="numeric" bind:value={form.barcode} placeholder={t('basics.barcode')} maxlength="14" />
    </div>
    <div class="sheet-actions">
      <button type="button" class="ghost" onclick={() => (editing = null)}>{t('common.cancel')}</button>
      <button type="submit" class="btn-primary" disabled={saving || !form.name.trim()}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  </form>
{/snippet}

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  <div class="head">
    <h2>{t('basics.title')}</h2>
    <button class="ghost" onclick={startNew}>{t('basics.new')}</button>
  </div>

  {#if editing === 'new'}{@render basicForm()}{/if}

  <input type="search" class="search" bind:value={search} placeholder={t('basics.search')} />

  {#if message}<p class="success">{message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">{t('common.loading')}</p>
  {:else if basics.length === 0}
    <p class="muted">{t('basics.none')}</p>
  {:else if shown.length === 0}
    <p class="muted">{t('basics.noMatch')}</p>
  {:else}
    <ul class="rows">
      {#each shown as basic (basic.id)}
        <li>
          {#if editing === basic.id}
            {@render basicForm()}
          {:else}
            <div class="row">
              <button class="pick" class:active={picking?.id === basic.id} onclick={() => pick(basic)}>
                <span class="name">{basic.name}</span>
                {#if basic.default_amount}<span class="amount">{basic.default_amount}</span>{/if}
                {#if basic.barcode}<span class="amount" aria-hidden="true">▮▯▮</span>{/if}
              </button>
              <button class="icon" onclick={() => startEdit(basic)} aria-label={t('common.edit')} title={t('common.edit')}>✏️</button>
              <button class="icon" onclick={() => remove(basic)} aria-label={t('common.delete')} title={t('common.delete')}>🗑️</button>
            </div>
            {#if picking?.id === basic.id}
              <div class="quantity">
                <span class="label">{t('basics.howMany')}</span>
                <QuantityStepper bind:value={quantity} />
                <button class="btn-primary add" onclick={add} disabled={adding}>{t('common.add')}</button>
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="sheet-actions">
    <button class="btn-primary" onclick={onclose}>{t('common.done')}</button>
  </div>
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .head .ghost { min-height: 48px; }

  .search { width: 100%; margin-bottom: 12px; }

  .basic-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
  }

  .form-row { display: flex; gap: 8px; }
  .form-row input { flex: 1; min-width: 0; }

  .rows {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }

  .rows li { border-bottom: 1px solid var(--tag); }
  .rows li:last-child { border-bottom: none; }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pick {
    flex: 1;
    min-width: 0;
    min-height: 56px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .pick:hover,
  .pick.active { background: var(--tag); }

  .name { font-weight: 600; }

  .amount {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: none;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .icon:hover { background: var(--tag); opacity: 1; }

  .quantity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 8px 0 16px;
  }

  .quantity .label { margin: 0; }
  .quantity .add { width: 100%; min-height: 56px; }

  .muted { color: var(--muted); text-align: center; }
  .success,
  .error { text-align: center; }
</style>
