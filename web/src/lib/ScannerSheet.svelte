<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import QuantityStepper from './QuantityStepper.svelte';

  // householdId: whose Basics; listId: the open list items get added to
  let { householdId, listId, onclose, onadded } = $props();

  // 'manual' (type in a code) → 'busy' → 'quantity' (known Basic) | 'new' (unknown code)
  let view = $state('manual');
  let code = $state('');
  let error = $state('');
  let message = $state('');

  // Known Basic for the quantity screen
  let found = $state(null);
  let quantity = $state(1);
  // Form for an unknown code
  let form = $state({ name: '', default_amount: '', barcode: '', alsoAdd: false });
  let saving = $state(false);

  const BARCODE = /^\d{6,14}$/;

  async function getJson(url, options) {
    const res = await fetch(url, options);
    return { status: res.status, data: await res.json().catch(() => null) };
  }

  // Back to the start for the next product; message stays visible
  function next() {
    found = null;
    code = '';
    view = 'manual';
  }

  async function lookup(raw) {
    const clean = String(raw).replace(/\s/g, '');
    error = '';
    message = '';
    if (!BARCODE.test(clean)) {
      error = t('basics.barcodeInvalid');
      return;
    }
    view = 'busy';
    try {
      const { status, data } = await getJson(`/api/households/${householdId}/basics/by-barcode/${clean}`);
      if (status === 200) {
        found = data;
        quantity = 1;
        view = 'quantity';
        return;
      }
      if (status !== 404) throw new Error();
      // New product: pre-fill from Open Food Facts (nulls if unknown)
      const product = (await getJson(`/api/barcode/${clean}`)).data ?? {};
      form = { name: productName(product), default_amount: product.amount ?? '', barcode: clean, alsoAdd: false };
      view = 'new';
    } catch {
      error = t('scan.offline');
      view = 'manual';
    }
  }

  // "Ferrero Nutella": brand first unless the name already contains it
  function productName({ name, brand }) {
    const full = !brand ? name : !name ? brand : name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
    return (full ?? '').slice(0, 100);
  }

  async function addToList(basic, n) {
    const res = await fetch(`/api/lists/${listId}/items/from-basic/${basic.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: n }),
    });
    if (!res.ok) throw new Error();
    onadded?.();
  }

  async function addFound() {
    if (saving) return;
    saving = true;
    error = '';
    try {
      await addToList(found, quantity);
      message = t('basics.added', { n: quantity, name: found.name });
      next();
    } catch {
      error = t('common.notSaved');
    } finally {
      saving = false;
    }
  }

  async function saveNew(event) {
    event.preventDefault();
    if (!form.name.trim() || saving) return;
    saving = true;
    error = '';
    try {
      const { status, data } = await getJson(`/api/households/${householdId}/basics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, default_amount: form.default_amount, barcode: form.barcode }),
      });
      if (status === 409) {
        // Someone else just saved this code: treat it as known
        saving = false;
        return lookup(form.barcode);
      }
      if (status !== 201) throw new Error();
      const name = form.name.trim();
      if (form.alsoAdd) {
        await addToList({ id: data.id }, 1);
        message = t('scan.savedAndAdded', { name });
      } else {
        message = t('scan.saved', { name });
      }
      next();
    } catch {
      error = t('common.notSaved');
    } finally {
      saving = false;
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  <h2>{t('scan.title')}</h2>

  {#if message}<p class="success">{message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if view === 'manual'}
    <form class="manual" onsubmit={(e) => { e.preventDefault(); lookup(code); }}>
      <input
        type="text"
        inputmode="numeric"
        autocomplete="off"
        bind:value={code}
        placeholder={t('scan.codePlaceholder')}
        maxlength="20"
      />
      <button type="submit" class="btn-primary" disabled={!code.trim()}>{t('scan.check')}</button>
    </form>
  {:else if view === 'busy'}
    <p class="muted">{t('scan.looking')}</p>
  {:else if view === 'quantity'}
    <div class="quantity">
      <p class="product">{found.name}</p>
      {#if found.default_amount}<p class="muted">{found.default_amount}</p>{/if}
      <span class="label">{t('basics.howMany')}</span>
      <QuantityStepper bind:value={quantity} />
      <button class="btn-primary big" onclick={addFound} disabled={saving}>{t('common.add')}</button>
      <button class="ghost" onclick={next}>{t('common.cancel')}</button>
    </div>
  {:else if view === 'new'}
    <form class="new" onsubmit={saveNew}>
      <h3>{t('scan.newProduct')}</h3>
      <p class="muted left">{t('scan.newHint')}</p>
      <input type="text" bind:value={form.name} placeholder={t('basics.name')} maxlength="100" required />
      <input type="text" bind:value={form.default_amount} placeholder={t('basics.amount')} maxlength="30" />
      <input type="text" value={form.barcode} readonly aria-label={t('basics.barcode')} class="readonly" />
      <label class="also">
        <input type="checkbox" bind:checked={form.alsoAdd} />
        {t('scan.alsoAdd')}
      </label>
      <button type="submit" class="btn-primary big" disabled={saving || !form.name.trim()}>
        {saving ? t('common.saving') : t('scan.saveBasic')}
      </button>
      <button type="button" class="ghost" onclick={next}>{t('common.cancel')}</button>
    </form>
  {/if}

  <div class="sheet-actions">
    <button class="btn-primary" onclick={onclose}>{t('common.done')}</button>
  </div>
</div>

<style>
  h2 { margin-bottom: 14px !important; }
  h3 { margin: 0; }

  .manual {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .manual input { flex: 1; min-width: 0; font-size: 1.2rem; letter-spacing: 0.05em; }
  .manual .btn-primary { min-height: 48px; }

  .quantity,
  .new {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }

  .quantity { align-items: center; }
  .quantity .label { margin: 0; }

  .product {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    text-align: center;
  }

  .big { width: 100%; min-height: 56px; font-size: 1.1rem; }
  .ghost { min-height: 48px; width: 100%; }

  .readonly { opacity: 0.7; letter-spacing: 0.05em; }

  .also {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    cursor: pointer;
  }

  .also input { width: 22px; height: 22px; accent-color: var(--accent); }

  .muted { color: var(--muted); text-align: center; margin: 0; }
  .muted.left { text-align: left; }
  .success,
  .error { text-align: center; }
</style>
