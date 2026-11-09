<script>
  import { fly, fade } from 'svelte/transition';
  import { TIME_LABELS } from './constants.js';
  import { todayISO, formatShort, SLOT_LABELS } from './dates.js';

  let { recipeId, calendars = [], lists = [], onclose, onreroll = null } = $props();

  let recipe = $state(null);
  let error = $state('');

  let planCalendarId = $state(calendars[0]?.id ?? null);
  let planDate = $state(todayISO());
  let planSlot = $state('dinner');
  let planMessage = $state('');
  let planOk = $state(false);

  let targetListId = $state(lists[0]?.id ?? null);
  let addedMessage = $state('');

  async function load(id) {
    error = '';
    planMessage = '';
    addedMessage = '';
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error('Rezept konnte nicht geladen werden');
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
        body: JSON.stringify({ date: planDate, slot: planSlot, recipe_id: recipe.id }),
      });
      if (res.status === 409) throw new Error('Da ist schon etwas geplant 📅');
      if (!res.ok) throw new Error('Hat nicht geklappt, nochmal versuchen');
      planOk = true;
      planMessage = `✓ Eingeplant: ${formatShort(planDate)} · ${SLOT_LABELS[planSlot]}`;
    } catch (e) {
      planOk = false;
      planMessage = e.message;
    }
  }

  async function addToList() {
    if (!targetListId) return;
    try {
      const res = await fetch(`/api/lists/${targetListId}/from-recipe/${recipe.id}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = lists.find((l) => l.id === targetListId);
      addedMessage = `✓ ${data.added} Zutaten auf „${list?.name}"`;
    } catch {
      addedMessage = 'Hat nicht geklappt, nochmal versuchen';
    }
  }
</script>

<button class="backdrop" aria-label="Schliessen" onclick={onclose} transition:fade={{ duration: 150 }}></button>

<div class="sheet" role="dialog" aria-modal="true" transition:fly={{ y: 300, duration: 250 }}>
  {#if error}<p class="error">{error}</p>{/if}

  {#if !recipe}
    <p class="muted">Lade…</p>
  {:else}
    {#if onreroll}<span class="badge">🎲 Zufallstreffer</span>{/if}
    <h2>{recipe.name}</h2>

    <div class="tags">
      <span class="tag">⏱️ {TIME_LABELS[recipe.time_range]}</span>
      <span class="tag">{'🔪'.repeat(recipe.difficulty)}</span>
    </div>

    {#if recipe.ingredients.length > 0}
      <span class="label">Zutaten</span>
      <ul>
        {#each recipe.ingredients as ing}
          <li>
            <span class="amount">{ing.amount ?? ''}</span>
            <span>{ing.name}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if calendars.length > 0}
      <div class="action">
        <span class="label">📅 Einplanen</span>
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
            <option value="lunch">Mittag</option>
            <option value="dinner">Abend</option>
          </select>
        </div>
        <button class="action-btn" onclick={plan}>📅 Einplanen</button>
        {#if planMessage}
          <p class="message" class:ok={planOk} class:fail={!planOk}>{planMessage}</p>
        {/if}
      </div>
    {/if}

    {#if recipe.ingredients.length > 0 && lists.length > 0}
      <div class="action">
        <span class="label">🛒 Zutaten auf Liste</span>
        <select class="spaced" bind:value={targetListId}>
          {#each lists as l (l.id)}
            <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
          {/each}
        </select>
        <button class="action-btn" onclick={addToList}>🛒 Hinzufügen</button>
        {#if addedMessage}<p class="message ok">{addedMessage}</p>{/if}
      </div>
    {/if}
  {/if}

  <div class="sheet-actions">
    {#if onreroll}
      <button class="ghost" onclick={onreroll}>🎲 Nochmal</button>
    {/if}
    <button class="btn-primary" onclick={onclose}>Fertig</button>
  </div>
</div>

<style>
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
    display: flex;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--tag);
  }

  li:last-child { border-bottom: none; }

  .amount {
    min-width: 64px;
    color: var(--muted);
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

  .action-btn:hover {
    background: var(--accent);
    color: white;
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