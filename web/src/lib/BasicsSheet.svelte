<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import QuantityStepper from './QuantityStepper.svelte';
  import CategoryPicker from './CategoryPicker.svelte';

  // householdId: whose Basics; listId: the open list items get added to;
  // shop: categories (from /api/shop) for the category picker
  let { householdId, listId, shop, onclose, onadded } = $props();

  let byId = $derived(new Map(shop.categories.map((c) => [c.id, c])));

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
  let form = $state({ name: '', default_amount: '', barcode: '', category_id: null });
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
    const name = search.trim();
    // Pre-select the category this name already has, if any
    form = { name, default_amount: '', barcode: '', category_id: shop.tags?.[name.toLocaleLowerCase('de')] ?? null };
  }

  function startEdit(basic) {
    picking = null;
    message = '';
    editing = basic.id;
    form = {
      name: basic.name,
      default_amount: basic.default_amount ?? '',
      barcode: basic.barcode ?? '',
      category_id: basic.category_id ?? null,
    };
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
        body: JSON.stringify({
          name: form.name,
          default_amount: form.default_amount,
          barcode: barcode || null,
          category_id: form.category_id,
        }),
      });
      if (res.status === 409) throw new Error(t('basics.barcodeTaken'));
      if (!res.ok) throw new Error(t('common.notSaved'));
      editing = null;
      await load();
      // The category is remembered per name, so list items may have moved
      onadded?.();
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
    <CategoryPicker {shop} bind:value={form.category_id} />
    <div class="sheet-actions">
      <button type="button" class="ghost" onclick={() => (editing = null)}>{t('common.cancel')}</button>
      <button type="submit" class="btn-primary" disabled={saving || !form.name.trim()}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  </form>
{/snippet}

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet tall" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  <!-- Fixed top: title, search, new form, messages -->
  <div class="top">
    <div class="head">
      <h2>
        {t('basics.title')}
        {#if basics.length}<span class="count">{basics.length}</span>{/if}
      </h2>
      <button class="new-btn" class:active={editing === 'new'} onclick={startNew}>{t('basics.new')}</button>
    </div>

    <div class="search">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input type="search" bind:value={search} placeholder={t('basics.search')} aria-label={t('basics.search')} />
      {#if search}
        <button class="clear" onclick={() => (search = '')} aria-label={t('common.close')}>✕</button>
      {/if}
    </div>

    {#if editing === 'new'}{@render basicForm()}{/if}

    {#if message}<p class="success">{message}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
  </div>

  <!-- Only this part scrolls -->
  <div class="scroll">
    {#if loading}
      <p class="muted">{t('common.loading')}</p>
    {:else if basics.length === 0}
      <p class="muted">{t('basics.none')}</p>
    {:else if shown.length === 0}
      <p class="muted">{t('basics.noMatch')}</p>
      {#if editing !== 'new'}
        <button class="create" onclick={startNew}>{t('basics.createFromSearch', { name: search.trim() })}</button>
      {/if}
    {:else}
      <ul class="rows">
        {#each shown as basic (basic.id)}
          <li class:open={picking?.id === basic.id || editing === basic.id}>
            {#if editing === basic.id}
              {@render basicForm()}
            {:else}
              <div class="row">
                <button class="pick" onclick={() => pick(basic)}>
                  <span class="name">
                    {#if byId.get(basic.category_id)}<span class="emoji">{byId.get(basic.category_id).emoji ?? ''}</span>{/if}
                    {basic.name}
                  </span>
                  {#if basic.default_amount}<span class="amount">{basic.default_amount}</span>{/if}
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
  </div>

  <div class="bottom">
    <button class="btn-primary done" onclick={onclose}>{t('common.done')}</button>
  </div>
</div>

<style>
  /* Taller than the other sheets: fixed top and bottom, the list scrolls in between */
  .sheet.tall {
    display: flex;
    flex-direction: column;
    height: 80vh;
    height: 80dvh;
    max-height: none;
    overflow: hidden;
    padding-top: 20px;
  }

  .top { flex-shrink: 0; }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }

  .count {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--tag);
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .new-btn {
    min-height: 48px;
    padding: 0 18px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .new-btn.active { opacity: 0.7; }

  .search {
    position: relative;
    margin-bottom: 12px;
  }

  .search input {
    width: 100%;
    min-height: 52px;
    padding-left: 44px;
    padding-right: 44px;
    font-size: 1.05rem;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.6;
    pointer-events: none;
  }

  .clear {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 1rem;
    cursor: pointer;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -20px;
    padding: 0 20px;
  }

  .bottom {
    flex-shrink: 0;
    padding-top: 12px;
  }

  .done { width: 100%; min-height: 52px; }

  .basic-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    margin-bottom: 12px;
    border-radius: 16px;
    background: var(--bg);
  }

  .form-row { display: flex; gap: 8px; }
  .form-row input { flex: 1; min-width: 0; }

  .rows {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rows li {
    border: 2px solid var(--tag);
    border-radius: 16px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .rows li.open { border-color: var(--accent); }
  .rows li .basic-form { margin: 0; border-radius: 0; }

  .row {
    display: flex;
    align-items: center;
    padding-right: 4px;
  }

  .pick {
    flex: 1;
    min-width: 0;
    min-height: 60px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 14px;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .pick:hover { background: var(--tag); }

  .name {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .amount {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .emoji { margin-right: 4px; }

  .icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: none;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0.55;
  }

  .icon:hover { background: var(--tag); opacity: 1; }

  .quantity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 4px 14px 16px;
  }

  .quantity .label { margin: 0; }
  .quantity .add { width: 100%; min-height: 56px; }

  .create {
    display: block;
    width: 100%;
    min-height: 52px;
    border: 2px dashed var(--accent);
    border-radius: 16px;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .muted { color: var(--muted); text-align: center; }
  .success,
  .error { text-align: center; margin: 0 0 10px; }
</style>
