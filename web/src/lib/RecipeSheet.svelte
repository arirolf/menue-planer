<script>
  import { fly, fade } from 'svelte/transition';
  import { TIME_LABELS, effortLabel } from './constants.js';
  import { todayISO, formatShort, slotLabel } from './dates.js';
  import { t, numberFormat } from './i18n.svelte.js';
  import { BASE_SERVINGS, amountFor, amountStep, stepAmount } from '../../../shared/scale.js';
  import ServingsPicker from './ServingsPicker.svelte';
  import { features } from './features.svelte.js';

  let { recipeId, calendars = [], lists = [], onclose, onreroll = null, onchecked = null } = $props();

  let recipe = $state(null);
  let error = $state('');

  let planCalendarId = $state(calendars[0]?.id ?? null);
  let planDate = $state(todayISO());
  let planSlot = $state('dinner');
  let planMessage = $state('');
  let planOk = $state(false);

  let targetListId = $state(lists[0]?.id ?? null);
  // Kept when rolling again, the family size doesn't change between recipes
  let servings = $state(BASE_SERVINGS);
  let addedMessage = $state('');
  // Server said the recipe is already on that list: offer to add it anyway
  let alreadyMessage = $state('');
  // Shown on the list items; filled in automatically after planning it in the calendar
  let listDate = $state('');

  // Amounts changed by hand before adding to a list: ingredient index -> { text, step }.
  // step is kept from where editing started, so ½ goes 1, 1½ instead of jumping by 1.
  let custom = $state({});
  let editing = $state(null);
  // Ingredient indexes we already have at home: crossed out and left off the list.
  // Kept when the number of people changes, cleared for another recipe.
  let atHome = $state([]);
  let checkError = $state('');

  // New number of people means new calculated amounts, so hand-changed ones start over
  $effect(() => {
    servings;
    custom = {};
    editing = null;
  });

  function calculated(ing) {
    return amountFor(ing, servings, numberFormat()) ?? '';
  }

  function changed(i) {
    return custom[i] != null && custom[i].text !== calculated(recipe.ingredients[i]);
  }

  function toggleEdit(i) {
    if (editing === i) {
      editing = null;
      return;
    }
    if (!custom[i]) {
      const text = calculated(recipe.ingredients[i]);
      custom[i] = { text, step: amountStep(text) };
    }
    editing = i;
  }

  function stepBy(i, direction) {
    const c = custom[i];
    c.text = stepAmount(c.text, direction, c.step, numberFormat());
  }

  function toggleHome(i) {
    atHome = atHome.includes(i) ? atHome.filter((x) => x !== i) : [...atHome, i];
    if (editing === i) editing = null;
  }

  async function toggleChecked() {
    checkError = '';
    const checked = !recipe.checked;
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/checked`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked }),
      });
      if (!res.ok) throw new Error();
      recipe.checked = checked;
      onchecked?.(recipe.id, checked);
    } catch {
      checkError = t('common.notSaved');
    }
  }

  function resetAmount(i) {
    delete custom[i];
    editing = null;
  }

  async function load(id) {
    error = '';
    planMessage = '';
    addedMessage = '';
    alreadyMessage = '';
    custom = {};
    editing = null;
    atHome = [];
    checkError = '';
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error(t('common.loadRecipeFailed'));
      const data = await res.json();
      if (id === recipeId) recipe = data; // ignore answers for an older roll
    } catch (e) {
      error = e.message;
    }
  }

  // Load again whenever a different recipe is shown (e.g. "Nochmal")
  $effect(() => {
    load(recipeId);
  });

  async function plan() {
    planMessage = '';
    try {
      const res = await fetch(`/api/calendars/${planCalendarId}/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: planDate, slot: planSlot, recipe_id: recipe.id, servings }),
      });
      if (res.status === 409) throw new Error(t('sheet.slotTaken'));
      if (!res.ok) throw new Error(t('common.tryAgain'));
      planOk = true;
      listDate = planDate;
      planMessage = t('sheet.planned', { when: `${formatShort(planDate)} · ${slotLabel(planSlot)}` });
    } catch (e) {
      planOk = false;
      planMessage = e.message;
    }
  }

  async function addToList(force = false) {
    if (!targetListId) return;
    addedMessage = '';
    alreadyMessage = '';
    try {
      const res = await fetch(`/api/lists/${targetListId}/from-recipe/${recipe.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servings,
          planned_date: listDate || null,
          amounts: recipe.ingredients.map((_, i) => (changed(i) ? custom[i].text : null)),
          skip: atHome,
          force,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.already) {
        alreadyMessage = data.meal_date
          ? t('sheet.alreadyOnListFor', { date: formatShort(data.meal_date) })
          : t('sheet.alreadyOnList');
        return;
      }
      const list = lists.find((l) => l.id === targetListId);
      addedMessage = t('servings.addedFor', { n: data.added, people: servings, list: list?.name });
    } catch {
      addedMessage = t('common.tryAgain');
    }
  }
</script>

<button class="backdrop" aria-label={t('common.close')} onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  {#if error}<p class="error">{error}</p>{/if}

  {#if !recipe}
    <p class="muted">{t('common.loading')}</p>
  {:else}
    {#if onreroll}<span class="badge">{t('sheet.randomPick')}</span>{/if}
    <h2>{recipe.name}</h2>

    <div class="tags">
      <span class="tag">⏱️ {TIME_LABELS[recipe.time_range]}</span>
      <span class="tag">{effortLabel(recipe.difficulty)}</span>
    </div>

    {#if features.recipeChecks}
    <div class="check-row">
      <span class="check-state" class:ok={recipe.checked}>
        {t(recipe.checked ? 'recipe.checked' : 'recipe.unchecked')}
      </span>
      <button class="check-btn" onclick={toggleChecked}>
        {t(recipe.checked ? 'recipe.markUnchecked' : 'recipe.markChecked')}
      </button>
    </div>
    {#if checkError}<p class="error">{checkError}</p>{/if}
    {/if}

    {#if recipe.notes}
      <p class="notes">📖 {recipe.notes}</p>
    {/if}

    {#if recipe.ingredients.length > 0}
      <ServingsPicker bind:servings />
      <span class="label">{t('servings.ingredientsFor', { n: servings })}</span>
      <p class="hint">{t('sheet.atHomeHint')}</p>
      <ul>
        {#each recipe.ingredients as ing, i}
          {@const home = atHome.includes(i)}
          <li>
            <div class="ing-row" class:home>
              <span class="amount" class:changed={changed(i)}>{custom[i]?.text ?? calculated(ing)}</span>
              <span class="ing-name">{ing.name}</span>
              <button
                class="edit-btn home-btn"
                class:active={home}
                aria-label={t('sheet.atHome')}
                aria-pressed={home}
                title={t('sheet.atHome')}
                onclick={() => toggleHome(i)}>🏠</button
              >
              {#if lists.length > 0 && !home}
                <button
                  class="edit-btn"
                  class:active={editing === i}
                  aria-label={t('sheet.editAmount')}
                  title={t('sheet.editAmount')}
                  onclick={() => toggleEdit(i)}>±</button
                >
              {/if}
            </div>
            {#if editing === i && custom[i]}
              <div class="stepper">
                <button
                  class="step-btn"
                  disabled={!custom[i].step}
                  aria-label={t('sheet.less')}
                  onclick={() => stepBy(i, -1)}>−</button
                >
                <input
                  type="text"
                  bind:value={custom[i].text}
                  oninput={() => (custom[i].step = amountStep(custom[i].text))}
                  aria-label={t('sheet.editAmount')}
                />
                <button
                  class="step-btn"
                  disabled={!custom[i].step}
                  aria-label={t('sheet.more')}
                  onclick={() => stepBy(i, 1)}>+</button
                >
                {#if changed(i)}
                  <button class="step-btn" aria-label={t('sheet.resetAmount')} title={t('sheet.resetAmount')} onclick={() => resetAmount(i)}>↺</button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if calendars.length > 0}
      <div class="action">
        <span class="label">{t('sheet.plan')}</span>
        {#if calendars.length > 1}
          <select class="spaced" bind:value={planCalendarId}>
            {#each calendars as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        {/if}
        <div class="row">
          <input type="date" bind:value={planDate} />
          <select class="slot-select" bind:value={planSlot}>
            <option value="lunch">{t('slot.lunch')}</option>
            <option value="dinner">{t('slot.dinner')}</option>
          </select>
        </div>
        <button class="action-btn" onclick={plan}>{t('sheet.plan')}</button>
        {#if planMessage}
          <p class="message" class:ok={planOk} class:fail={!planOk}>{planMessage}</p>
        {/if}
      </div>
    {/if}

    {#if recipe.ingredients.length > 0 && lists.length > 0}
      <div class="action">
        <span class="label">{t('sheet.toList')}</span>
        <select class="spaced" bind:value={targetListId} onchange={() => (alreadyMessage = '')}>
          {#each lists as l (l.id)}
            <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
          {/each}
        </select>
        <label class="date-field">
          <span>{t('sheet.listDate')}</span>
          <input type="date" bind:value={listDate} />
        </label>
        <button class="action-btn" onclick={() => addToList()} disabled={atHome.length >= recipe.ingredients.length}>
          {t('sheet.addToList')}
        </button>
        {#if addedMessage}<p class="message ok">{addedMessage}</p>{/if}
        {#if alreadyMessage}
          <p class="message ok">✓ {alreadyMessage}</p>
          <button class="anyway" onclick={() => addToList(true)}>{t('sheet.addAnyway')}</button>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="sheet-actions">
    {#if onreroll}
      <button class="ghost" onclick={onreroll}>{t('sheet.reroll')}</button>
    {/if}
    <button class="btn-primary" onclick={onclose}>{t('common.done')}</button>
  </div>
</div>

<style>
  .anyway {
    display: block;
    margin: 4px auto 0;
    min-height: 44px;
    padding: 0 12px;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.9rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .badge {
    display: inline-block;
    margin-bottom: 8px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--tag);
    font-size: 0.8rem;
  }

  h2 { margin-bottom: 12px !important; }

  .tags {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .tag {
    background: var(--tag);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    padding: 8px 0;
    border-bottom: 1px solid var(--tag);
  }

  li:last-child { border-bottom: none; }

  .ing-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ing-name { flex: 1; }

  .ing-row.home .amount,
  .ing-row.home .ing-name {
    text-decoration: line-through;
    opacity: 0.45;
  }
  .home-btn { font-size: 0.9rem; filter: grayscale(1); opacity: 0.5; }
  .home-btn.active { filter: none; opacity: 1; }

  .hint {
    margin: 0 0 4px;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: -8px 0 16px;
  }
  .check-state {
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    font-size: 0.85rem;
  }
  .check-state.ok {
    background: color-mix(in srgb, var(--success) 15%, transparent);
  }
  .check-btn {
    padding: 4px 0;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .notes {
    margin: 0 0 16px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--tag);
    white-space: pre-line;
  }

  .amount {
    min-width: 64px;
    color: var(--muted);
  }
  .amount.changed {
    color: var(--accent);
    font-weight: 600;
  }

  .edit-btn,
  .step-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .edit-btn:hover,
  .step-btn:hover:not(:disabled) { border-color: var(--accent); }
  .edit-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .step-btn { width: 40px; height: 40px; font-size: 1.1rem; }
  .step-btn:disabled { opacity: 0.4; cursor: default; }

  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .stepper input {
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .action {
    margin-top: 20px;
    padding-top: 18px;
    border-top: 1px solid var(--tag);
  }

  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .slot-select {
    width: 120px;
    flex-shrink: 0;
  }

  .spaced { margin-bottom: 8px; }

  .date-field {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    font-size: 0.9rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .date-field input { flex: 1; min-width: 0; }

  .action-btn {
    width: 100%;
    padding: 14px;
    border: 2px solid var(--accent);
    border-radius: 999px;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .action-btn:disabled { opacity: 0.4; cursor: default; }

  .action-btn:hover:not(:disabled) {
    background: var(--accent);
    color: var(--on-accent);
  }

  .message {
    text-align: center;
    margin: 10px 0 0;
  }

  .message.ok { color: var(--success); }
  .message.fail,
  .error { color: var(--error); text-align: center; }

  .muted {
    color: var(--muted);
    text-align: center;
  }

  .sheet-actions { margin-top: 24px; }
</style>