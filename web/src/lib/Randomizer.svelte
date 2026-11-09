<script>
  import { fly } from 'svelte/transition';
  import { TIME_LABELS } from './constants.js';
  import { todayISO, formatShort, SLOT_LABELS } from './dates.js';

  const EATERS_KEY = 'menu.eaters';

  const timeFilters = [
    { value: 6, label: 'Egal' },
    { value: 2, label: '≤ 20 min' },
    { value: 3, label: '≤ 30 min' },
    { value: 5, label: '≤ 60 min' },
  ];

  const difficultyFilters = [
    { value: 3, label: 'Egal' },
    { value: 1, label: '🔪' },
    { value: 2, label: '🔪🔪' },
  ];

  let maxTime = $state(6);
  let maxDifficulty = $state(3);

  let users = $state([]);
  let eaters = $state([]);

  let recipe = $state(null);
  let loading = $state(false);
  let error = $state('');
  let rollCount = $state(0);

  let lists = $state([]);
  let targetListId = $state(null);
  let addedMessage = $state('');

  let calendars = $state([]);
  let planCalendarId = $state(null);
  let planDate = $state(todayISO());
  let planSlot = $state('dinner');
  let planMessage = $state('');
  let planOk = $state(false);

  // ---------- Who is eating (remembered on this device) ----------

  function restoreEaters() {
    const ids = users.map((u) => u.id);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(EATERS_KEY));
    } catch {
      // private mode or broken value: just start fresh
    }
    eaters = Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : ids;
  }

  function toggleEater(id) {
    eaters = eaters.includes(id) ? eaters.filter((e) => e !== id) : [...eaters, id];
    try {
      localStorage.setItem(EATERS_KEY, JSON.stringify(eaters));
    } catch {
      // not saved, but the filter still works for now
    }
  }

  // ---------- Loading ----------

  async function loadTargets() {
    try {
      const [uRes, lRes, cRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/lists'),
        fetch('/api/calendars'),
      ]);
      if (uRes.ok) {
        users = await uRes.json();
        restoreEaters();
      }
      if (lRes.ok) {
        lists = await lRes.json();
        targetListId = lists[0]?.id ?? null;
      }
      if (cRes.ok) {
        calendars = await cRes.json();
        planCalendarId = calendars[0]?.id ?? null;
      }
    } catch {
      // then those parts just won't show
    }
  }

  // ---------- Actions ----------

  async function roll() {
    loading = true;
    error = '';
    addedMessage = '';
    planMessage = '';
    try {
      const params = new URLSearchParams({
        max_time: maxTime,
        max_difficulty: maxDifficulty,
      });
      if (eaters.length > 0) params.set('eaters', eaters.join(','));

      const res = await fetch(`/api/recipes/random?${params}`);
      if (res.status === 404) throw new Error('Kein passendes Rezept gefunden 🤷');
      if (!res.ok) throw new Error('Server-Fehler, bitte nochmal versuchen');
      recipe = await res.json();
      rollCount++;
    } catch (e) {
      error = e.message;
      recipe = null;
    } finally {
      loading = false;
    }
  }

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

  loadTargets();
</script>

<div class="page">
  <h1>Was kochen wir heute?</h1>
  <p class="subtitle">Ein Klick, und die Diskussion ist vorbei.</p>

  <section class="filters">
    {#if users.length > 0}
      <div>
        <span class="label">Wer isst mit?</span>
        <div class="chips centered">
          {#each users as u (u.id)}
            <button
              class="chip"
              class:active={eaters.includes(u.id)}
              onclick={() => toggleEater(u.id)}
            >
              {u.username}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div>
      <span class="label">Zeit</span>
      <div class="chips centered">
        {#each timeFilters as f}
          <button
            class="chip"
            class:active={maxTime === f.value}
            onclick={() => (maxTime = f.value)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>

    <div>
      <span class="label">Max. Aufwand</span>
      <div class="chips centered">
        {#each difficultyFilters as f}
          <button
            class="chip"
            class:active={maxDifficulty === f.value}
            onclick={() => (maxDifficulty = f.value)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <button class="btn-primary" onclick={roll} disabled={loading}>
    {loading ? '…' : '🎲 Würfeln'}
  </button>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if recipe}
    {#key rollCount}
      <article class="card" in:fly={{ y: 20, duration: 300 }}>
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
      </article>
    {/key}
  {/if}
</div>

<style>
  .page { text-align: center; }

  h1 {
    font-size: 2rem;
    margin: 0 0 8px;
  }

  .subtitle {
    color: var(--muted);
    margin: 0 0 28px;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 28px;
  }

  .centered { justify-content: center; }

  .error { margin-top: 24px; }

  .card {
    margin-top: 32px;
    padding: 28px 24px;
    background: var(--card);
    border-radius: 20px;
    box-shadow: var(--shadow);
    text-align: left;
  }

  .card h2 {
    margin: 0 0 12px;
    font-size: 1.6rem;
  }

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
  .message.fail { color: var(--error); }
</style>