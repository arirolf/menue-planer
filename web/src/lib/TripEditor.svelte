<script>
  import { fly, fade } from 'svelte/transition';
  import { formatShort } from './dates.js';
  import { t } from './i18n.svelte.js';

  let { calendarId, date, trip = null, lists = [], onclose, onsaved } = $props();

  const isEdit = trip !== null;

  let tripDate = $state(trip?.date ?? date);
  let time = $state(trip?.time ?? '');
  let listId = $state(isEdit ? (trip.list_id ?? '') : (lists[0]?.id ?? ''));
  let note = $state(trip?.note ?? '');
  let saving = $state(false);
  let error = $state('');

  async function save(event) {
    event.preventDefault();
    error = '';
    saving = true;
    try {
      const url = isEdit
        ? `/api/calendars/${calendarId}/trips/${trip.id}`
        : `/api/calendars/${calendarId}/trips`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: tripDate,
          time: time || null,
          list_id: listId ? Number(listId) : null,
          note,
        }),
      });
      if (!res.ok) throw new Error(t('common.saveFailed'));
      onsaved();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm(t('trip.confirmDelete'))) return;
    try {
      const res = await fetch(`/api/calendars/${calendarId}/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('common.deleteFailed'));
      onsaved();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 250 }}>
  <h2>{t(isEdit ? 'trip.edit' : 'trip.new')}</h2>
  <p class="sub">🛒 {formatShort(date)}</p>

  <div class="field">
    <span class="label">{t('trip.when')}</span>
    <div class="row">
      <input type="date" bind:value={tripDate} required />
      <input type="time" class="time" bind:value={time} />
    </div>
  </div>

  <div class="field">
    <label class="label" for="list">{t('trip.list')}</label>
    <select id="list" bind:value={listId}>
      <option value="">{t('trip.noList')}</option>
      {#each lists as l (l.id)}
        <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label class="label" for="trip-note">{t('common.note')}</label>
    <textarea id="trip-note" bind:value={note} placeholder={t('trip.notePlaceholder')}></textarea>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="sheet-actions">
    <button type="button" class="ghost" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? t('common.saving') : t('common.save')}
    </button>
  </div>

  {#if isEdit}
    <button type="button" class="danger-link" onclick={remove}>{t('trip.delete')}</button>
  {/if}
</form>

<style>
  .row {
    display: flex;
    gap: 8px;
  }

  .row .time {
    width: 120px;
    flex-shrink: 0;
  }

  .error { text-align: center; }
</style>