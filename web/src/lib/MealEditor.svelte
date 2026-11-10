<script>
  import { fly, fade } from 'svelte/transition';
  import { slotLabel, formatShort } from './dates.js';
  import { t } from './i18n.svelte.js';
  import NoteRows from './NoteRows.svelte';
  import { BASE_SERVINGS } from '../../../shared/scale.js';
  import ServingsPicker from './ServingsPicker.svelte';

  let { calendarId, date, slot, meal = null, recipes = [], onclose, onsaved } = $props();

  const isEdit = meal !== null;

  let recipeId = $state(meal?.recipe_id ?? '');
  let title = $state(meal && !meal.recipe_id ? (meal.title ?? '') : '');
  let note = $state(meal?.note ?? '');
  let servings = $state(meal?.servings ?? BASE_SERVINGS);
  let newDate = $state(date);
  let newSlot = $state(slot);
  let saving = $state(false);
  let error = $state('');

  async function save(event) {
    event.preventDefault();
    error = '';
    if (!recipeId && !title.trim() && !note.trim()) {
      error = t('meal.needSomething');
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
          servings,
        }),
      });
      if (res.status === 409) throw new Error(t('meal.slotTaken'));
      if (!res.ok) throw new Error(t('common.saveFailed'));
      onsaved();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!confirm(t('meal.confirmDelete'))) return;
    try {
      const res = await fetch(`/api/calendars/${calendarId}/meals/${meal.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('common.deleteFailed'));
      onsaved();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<form class="sheet" onsubmit={save} transition:fly={{ y: 300, duration: 250 }}>
  <h2>{t(isEdit ? 'meal.edit' : 'meal.new')}</h2>
  <p class="sub">{formatShort(date)} · {slotLabel(slot)}</p>

  <div class="field">
    <label class="label" for="recipe">{t('meal.recipe')}</label>
    <select id="recipe" bind:value={recipeId}>
      <option value="">{t('meal.noRecipe')}</option>
      {#each recipes as r (r.id)}
        <option value={r.id}>{r.name}</option>
      {/each}
    </select>
  </div>

  {#if recipeId}
    <div class="field">
      <ServingsPicker bind:servings />
    </div>
  {:else}
    <div class="field">
      <label class="label" for="title">{t('meal.ownText')}</label>
      <input id="title" type="text" bind:value={title} placeholder={t('meal.titlePlaceholder')} />
    </div>
  {/if}

  <div class="field">
    <label class="label" for="note">{t('common.note')}</label>
    <NoteRows id="note" bind:value={note} placeholder={t('meal.notePlaceholder')} />
  </div>

  {#if isEdit}
    <div class="field">
      <span class="label">{t('meal.move')}</span>
      <div class="row">
        <input type="date" bind:value={newDate} required />
        <select bind:value={newSlot}>
          <option value="lunch">{t('slot.lunch')}</option>
          <option value="dinner">{t('slot.dinner')}</option>
        </select>
      </div>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  <div class="sheet-actions">
    <button type="button" class="ghost" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? t('common.saving') : t('common.save')}
    </button>
  </div>

  {#if isEdit}
    <button type="button" class="danger-link" onclick={remove}>{t('meal.delete')}</button>
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