<script>
  import { fly, fade } from 'svelte/transition';
  import { t } from './i18n.svelte.js';
  import { toISO, fromISO, addDays, startOfWeek, todayISO, formatShort, slotLabel } from './dates.js';

  // Puts the ingredients of every planned meal in a date range onto a list, each meal only once
  let { calendarId, lists, onclose } = $props();

  const MAX_DAYS = 62;
  const LIST_KEY = 'menu_update_list';
  const today = todayISO();
  const shift = (iso, days) => toISO(addDays(fromISO(iso), days));
  const monday = toISO(startOfWeek(fromISO(today)));

  const presets = [
    { key: 'next7', from: today, to: shift(today, 6) },
    { key: 'thisWeek', from: monday, to: shift(monday, 6) },
    { key: 'nextWeek', from: shift(monday, 7), to: shift(monday, 13) },
  ];

  let from = $state(today);
  let to = $state(shift(today, 6));
  // svelte-ignore state_referenced_locally
  let listId = $state(savedList());

  let meals = $state([]);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let message = $state('');
  let requestId = 0;

  let days = $derived(from && to ? (fromISO(to) - fromISO(from)) / 86400000 : -1);
  let rangeError = $derived(
    !from || !to ? t('update.pickDates') : days < 0 ? t('update.fromAfterTo') : days > MAX_DAYS ? t('update.tooLong', { n: MAX_DAYS }) : ''
  );
  let newCount = $derived(meals.filter((m) => m.status === 'new').length);

  function savedList() {
    try {
      const id = Number(localStorage.getItem(LIST_KEY));
      if (lists.some((l) => l.id === id)) return id;
    } catch {}
    return lists[0]?.id ?? null;
  }

  function pickList(id) {
    listId = id;
    message = '';
    try {
      localStorage.setItem(LIST_KEY, String(id));
    } catch {}
  }

  function usePreset(p) {
    from = p.from;
    to = p.to;
    message = '';
  }

  async function loadPreview() {
    const id = ++requestId;
    if (rangeError || !listId) {
      meals = [];
      return;
    }
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ list_id: listId, from, to });
      const res = await fetch(`/api/calendars/${calendarId}/to-list/preview?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (id === requestId) meals = data.meals; // ignore answers for older dates
    } catch {
      if (id === requestId) error = t('common.tryAgain');
    } finally {
      if (id === requestId) loading = false;
    }
  }

  // Reload whenever dates or list change
  $effect(() => {
    void [from, to, listId];
    loadPreview();
  });

  async function update() {
    if (busy || newCount === 0) return;
    busy = true;
    error = '';
    message = '';
    try {
      const res = await fetch(`/api/calendars/${calendarId}/to-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: listId, from, to }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      message = r.skipped_meals > 0
        ? t('update.doneSkipped', { n: r.added_items, skipped: r.skipped_meals })
        : t('update.done', { n: r.added_items });
      await loadPreview();
    } catch {
      error = t('common.tryAgain');
    } finally {
      busy = false;
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet tall" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  <div class="top">
    <h2>{t('update.title')}</h2>

    <div class="chips presets">
      {#each presets as p (p.key)}
        <button class="chip" class:active={from === p.from && to === p.to} onclick={() => usePreset(p)}>
          {t(`update.${p.key}`)}
        </button>
      {/each}
    </div>

    <div class="dates">
      <label>
        <span class="label">{t('update.from')}</span>
        <input type="date" bind:value={from} oninput={() => (message = '')} />
      </label>
      <label>
        <span class="label">{t('update.to')}</span>
        <input type="date" bind:value={to} oninput={() => (message = '')} />
      </label>
    </div>

    <label class="list-pick">
      <span class="label">{t('update.list')}</span>
      <select value={listId} onchange={(e) => pickList(Number(e.currentTarget.value))}>
        {#each lists as l (l.id)}
          <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="scroll">
    {#if rangeError}
      <p class="muted">{rangeError}</p>
    {:else if loading && meals.length === 0}
      <p class="muted">{t('common.loading')}</p>
    {:else if meals.length === 0}
      <p class="muted">{t('cal.noIngredients')}</p>
    {:else}
      <ul class="meals" class:faded={loading}>
        {#each meals as m (m.id)}
          <li>
            <span class="when">{formatShort(m.date)} · {slotLabel(m.slot)}</span>
            <span class="recipe">{m.recipe_name}</span>
            {#if m.status === 'new'}
              <span class="status new">{t('update.statusNew')}</span>
            {:else}
              <span class="status">{t('update.statusAlready')}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="bottom">
    {#if message}<p class="success">{message}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    <button class="btn-primary big" onclick={update} disabled={busy || loading || newCount === 0 || !!rangeError}>
      {#if busy}
        {t('common.saving')}
      {:else if newCount === 0}
        {t('update.nothingNew')}
      {:else}
        {t(newCount === 1 ? 'update.buttonOne' : 'update.button', { n: newCount })}
      {/if}
    </button>
    <button class="ghost close" onclick={onclose}>{t('common.done')}</button>
  </div>
</div>

<style>
  .sheet.tall {
    display: flex;
    flex-direction: column;
    height: 85vh;
    height: 85dvh;
    max-height: none;
    overflow: hidden;
    padding-top: 20px;
  }

  .top,
  .bottom { flex-shrink: 0; }

  h2 { margin: 0 0 12px !important; }

  .presets {
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    margin-bottom: 12px;
    padding-bottom: 2px;
  }

  .presets .chip {
    flex-shrink: 0;
    min-height: 44px;
    white-space: nowrap;
  }

  .dates {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .dates label { flex: 1; min-width: 0; }
  .dates input { width: 100%; min-height: 48px; }

  .label { display: block; margin-bottom: 4px; }

  .list-pick { display: block; margin-bottom: 12px; }
  .list-pick select { width: 100%; min-height: 48px; }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -20px;
    padding: 0 20px;
  }

  .meals {
    list-style: none;
    margin: 0;
    padding: 0;
    transition: opacity 0.15s;
  }

  .meals.faded { opacity: 0.5; }

  .meals li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    padding: 10px 2px;
    border-bottom: 1px solid var(--tag);
  }

  .when {
    grid-column: 1;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .recipe {
    grid-column: 1;
    font-weight: 600;
  }

  .status {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--tag);
    color: var(--muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .status.new {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }

  .bottom { padding-top: 12px; }
  .big { width: 100%; min-height: 56px; font-size: 1.05rem; }
  .close { width: 100%; min-height: 48px; margin-top: 8px; }

  .muted { color: var(--muted); text-align: center; }
  .success,
  .error { text-align: center; margin: 0 0 10px; }
</style>
