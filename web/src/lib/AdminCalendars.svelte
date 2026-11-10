<script>
  import { t } from './i18n.svelte.js';
  let households = $state([]);
  let calendars = $state([]);
  let loading = $state(true);
  let error = $state('');

  let rows = $derived(
    households.map((h) => ({
      household: h,
      calendar: calendars.find((c) => c.household_id === h.id) ?? null,
    }))
  );

  async function load() {
    error = '';
    try {
      const [hRes, cRes] = await Promise.all([
        fetch('/api/admin/households'),
        fetch('/api/admin/calendars'),
      ]);
      if (!hRes.ok || !cRes.ok) throw new Error(t('cal.loadFailed'));
      households = await hRes.json();
      calendars = await cRes.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function create(household) {
    error = '';
    try {
      const res = await fetch('/api/admin/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: household.id }),
      });
      if (!res.ok) throw new Error(t('common.createFailed'));
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(calendar) {
    if (!confirm(t('adminCal.confirmDelete', { name: calendar.name }))) return;
    error = '';
    try {
      const res = await fetch(`/api/admin/calendars/${calendar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('common.deleteFailed'));
      calendars = calendars.filter((c) => c.id !== calendar.id);
    } catch (e) {
      error = e.message;
    }
  }

  load();
</script>

<section class="calendars">
  <h2>{t('adminCal.title')}</h2>

  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">{t('common.loading')}</p>
  {:else if households.length === 0}
    <p class="muted">{t('adminCal.needHousehold')}</p>
  {:else}
    <ul class="list">
      {#each rows as row (row.household.id)}
        <li class="item">
          <span class="name">{row.household.name}</span>
          {#if row.calendar}
            <span class="status">{t('adminCal.active')}</span>
            <button class="icon-btn" onclick={() => remove(row.calendar)} title={t('adminCal.delete')}>🗑️</button>
          {:else}
            <button class="ghost" onclick={() => create(row.household)}>{t('common.create')}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .calendars { margin-top: 40px; }

  h2 {
    font-size: 1.5rem;
    margin: 0 0 16px;
    text-align: center;
  }

  .muted, .error { text-align: center; }
  .muted { color: var(--muted); }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 10px 12px 18px;
    border-bottom: 1px solid var(--tag);
  }

  .item:last-child { border-bottom: none; }

  .name {
    flex: 1;
    font-weight: 600;
  }

  .status {
    font-size: 0.85rem;
    color: var(--success);
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: none;
    font-size: 1.05rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .icon-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }
</style>