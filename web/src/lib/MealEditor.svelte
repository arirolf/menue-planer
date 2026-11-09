<script>
  import { fly, fade } from 'svelte/transition';
  import { SLOT_LABELS, formatShort } from './dates.js';

  let { calendarId, date, slot, meal = null, recipes = [], onclose, onsaved } = $props();

  const isEdit = meal !== null;

  let recipeId = $state(meal?.recipe_id ?? '');
  let title = $state(meal && !meal.recipe_id ? (meal.title ?? '') : '');
  let note = $state(meal?.note ?? '');
  let newDate = $state(date);
  let newSlot = $state(slot);
  let saving = $state(false);
  let error = $state('');

  async function save(event) {
    event.preventDefault();
    error = '';
    if (!recipeId && !title.trim() && !note.trim()) {
      error = 'Wähle ein Rezept, schreib etwas oder füge eine Info hinzu';
      return;
    }

    saving = true;
    try {
      const url = isEdit
        ? `/api/calendars/${calendarId}/meals/${meal.id}`
        : `/api/calendars/${calendarId}/meals`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDate,
          slot: newSlot,
          recipe_id: recipeId ? Number(recipeId) : null,
          title: recipeId ? null : title,
          note,
        }),
      });
      if (res.status === 409) throw new Error('Dieser Platz ist an dem Tag schon belegt');
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      onsaved();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm('Diesen Eintrag löschen?')) return;
    try {
      const res = await fetch(`/api/calendars/${calendarId}/meals/${meal.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      onsaved();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<button class="backdrop" aria-label="Schliessen" onclick={onclose} transition:fade={{ duration: 150 }}></button>

<form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 250 }}>
  <h2>{isEdit ? 'Essen bearbeiten' : 'Essen planen'}</h2>
  <p class="sub">{formatShort(date)} · {SLOT_LABELS[slot]}</p>

  <div class="field">
    <label class="label" for="recipe">Rezept</label>
    <select id="recipe" bind:value={recipeId}>
      <option value="">— Kein Rezept / eigener Text —</option>
      {#each recipes as r (r.id)}
        <option value={r.id}>{r.name}</option>
      {/each}
    </select>
  </div>

  {#if !recipeId}
    <div class="field">
      <label class="label" for="title">Eigener Text</label>
      <input id="title" type="text" bind:value={title} placeholder="z.B. Pizza bestellen" />
    </div>
  {/if}

  <div class="field">
    <label class="label" for="note">Info (optional)</label>
    <textarea id="note" bind:value={note} placeholder="z.B. Andri isst auswärts, Lunchbox mitnehmen"></textarea>
  </div>

  {#if isEdit}
    <div class="field">
      <span class="label">Verschieben</span>
      <div class="row">
        <input type="date" bind:value={newDate} required />
        <select bind:value={newSlot}>
          <option value="lunch">Mittag</option>
          <option value="dinner">Abend</option>
        </select>
      </div>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  <div class="sheet-actions">
    <button type="button" class="ghost" onclick={onclose}>Abbrechen</button>
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if isEdit}
    <button type="button" class="danger-link" onclick={remove}>🗑️ Eintrag löschen</button>
  {/if}
</form>

<style>
  .row {
    display: flex;
    gap: 8px;
  }

  .row select {
    width: 130px;
    flex-shrink: 0;
  }

  .error { text-align: center; }
</style>