<script>
  import { fly, fade } from 'svelte/transition';
  import { formatShort } from './dates.js';

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
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      onsaved();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm('Diesen Einkauf löschen?')) return;
    try {
      const res = await fetch(`/api/calendars/${calendarId}/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      onsaved();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<button class="backdrop" aria-label="Schliessen" onclick={onclose} transition:fade={{ duration: 150 }}></button>

<form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 250 }}>
  <h2>{isEdit ? 'Einkauf bearbeiten' : 'Einkauf planen'}</h2>
  <p class="sub">🛒 {formatShort(date)}</p>

  <div class="field">
    <span class="label">Wann</span>
    <div class="row">
      <input type="date" bind:value={tripDate} required />
      <input type="time" class="time" bind:value={time} />
    </div>
  </div>

  <div class="field">
    <label class="label" for="list">Einkaufsliste</label>
    <select id="list" bind:value={listId}>
      <option value="">— Keine Liste —</option>
      {#each lists as l (l.id)}
        <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label class="label" for="trip-note">Info (optional)</label>
    <textarea id="trip-note" bind:value={note} placeholder="z.B. Migros Kleinandelfingen, Papi fährt"></textarea>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="sheet-actions">
    <button type="button" class="ghost" onclick={onclose}>Abbrechen</button>
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if isEdit}
    <button type="button" class="danger-link" onclick={remove}>🗑️ Einkauf löschen</button>
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