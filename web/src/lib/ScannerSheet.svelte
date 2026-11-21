<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import QuantityStepper from './QuantityStepper.svelte';
  import CategoryPicker from './CategoryPicker.svelte';

  // householdId: whose Basics; listId: the open list items get added to;
  // shop: categories (from /api/shop) for the category picker
  let { householdId, listId, shop, onclose, onadded } = $props();

  // 'camera' | 'manual' (type in a code) → 'busy' → 'quantity' (known Basic) | 'new' (unknown code)
  // mode: where to go back to after each product
  let mode = $state('camera');
  let view = $state('camera');
  let code = $state('');
  let error = $state('');
  let message = $state('');

  // Known Basic for the quantity screen
  let found = $state(null);
  let quantity = $state(1);
  // Form for an unknown code
  let form = $state({ name: '', default_amount: '', barcode: '', category_id: null, alsoAdd: false });
  let saving = $state(false);

  const BARCODE = /^\d{6,14}$/;

  let video = $state(null);
  let starting = $state(false);
  // Why the camera isn't available: 'insecure' | 'denied' | 'nocamera' | 'failed'
  let cameraProblem = $state('');
  const PROBLEM_TEXT = {
    insecure: 'scan.insecure',
    denied: 'scan.cameraDenied',
    nocamera: 'scan.noCamera',
    failed: 'scan.cameraFailed',
  };

  // The camera runs only while the camera view is shown; leaving it (code found,
  // switch to typing, "Fertig") stops all tracks
  $effect(() => {
    if (view !== 'camera' || !video) return;
    const el = video;
    let stop = null;
    let cancelled = false;
    starting = true;
    import('./scanner.js')
      .then(({ startScanner }) => startScanner(el, (found) => lookup(found)))
      .then((stopFn) => {
        if (cancelled) stopFn();
        else stop = stopFn;
      })
      .catch((e) => {
        if (cancelled) return;
        cameraProblem = e?.kind ?? 'failed';
        mode = 'manual';
        view = 'manual';
      })
      .finally(() => {
        if (!cancelled) starting = false;
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  });

  function useCamera() {
    cameraProblem = '';
    error = '';
    mode = 'camera';
    view = 'camera';
  }

  function typeCode() {
    mode = 'manual';
    view = 'manual';
  }

  async function getJson(url, options) {
    const res = await fetch(url, options);
    return { status: res.status, data: await res.json().catch(() => null) };
  }

  // Back to the start for the next product; message stays visible
  function next() {
    found = null;
    code = '';
    view = mode;
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
      const name = productName(product);
      form = {
        name,
        default_amount: product.amount ?? '',
        barcode: clean,
        // Pre-select the category this name already has, if any
        category_id: shop.tags?.[name.trim().toLocaleLowerCase('de')] ?? null,
        alsoAdd: false,
      };
      view = 'new';
    } catch {
      error = t('scan.offline');
      view = mode;
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
        body: JSON.stringify({
          name: form.name,
          default_amount: form.default_amount,
          barcode: form.barcode,
          category_id: form.category_id,
        }),
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
        // The category is remembered per name, so list items may have moved
        if (form.category_id !== null) onadded?.();
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

  {#if view === 'camera'}
    <div class="camera">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline muted></video>
      <div class="frame" aria-hidden="true"></div>
      <p class="camera-hint">{starting ? t('scan.starting') : t('scan.pointCamera')}</p>
    </div>
    <button class="link" onclick={typeCode}>⌨️ {t('scan.typeCode')}</button>
  {:else if view === 'manual'}
    {#if cameraProblem}<p class="problem">{t(PROBLEM_TEXT[cameraProblem])}</p>{/if}
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
    {#if cameraProblem !== 'insecure'}
      <button class="link" onclick={useCamera}>{t('scan.useCamera')}</button>
    {/if}
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
      <CategoryPicker {shop} bind:value={form.category_id} />
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

  .camera {
    position: relative;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    margin-bottom: 8px;
    border-radius: 16px;
    background: #000;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Scan frame: a wide box in the middle, the rest dimmed */
  .frame {
    position: absolute;
    left: 12%;
    right: 12%;
    top: 30%;
    bottom: 30%;
    border: 3px solid var(--accent);
    border-radius: 12px;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
  }

  .camera-hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 8px;
    margin: 0;
    color: #fff;
    font-size: 0.9rem;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .link {
    display: block;
    width: 100%;
    min-height: 48px;
    margin-bottom: 12px;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .problem {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--tag);
    font-size: 0.9rem;
  }

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
