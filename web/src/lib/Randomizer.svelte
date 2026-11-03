<script>
  import { fly } from 'svelte/transition';
  import { TIME_LABELS } from './constants.js';

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

  let recipe = $state(null);
  let loading = $state(false);
  let error = $state('');
  let rollCount = $state(0);

  let lists = $state([]);
  let targetListId = $state(null);
  let addedMessage = $state('');

  async function loadLists() {
    try {
      const res = await fetch('/api/lists');
      if (!res.ok) return;
      lists = await res.json();
      targetListId = lists[0]?.id ?? null;
    } catch {
      // no lists then, the button just won't show
    }
  }

  async function roll() {
    loading = true;
    error = '';
    addedMessage = '';
    try {
      const params = new URLSearchParams({
        max_time: maxTime,
        max_difficulty: maxDifficulty,
      });
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

  loadLists();
</script>

<div class="page">
  <h1>Was kochen wir heute?</h1>
  <p class="subtitle">Ein Klick, und die Diskussion ist vorbei.</p>

  <section class="filters">
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

          {#if lists.length > 0}
            <div class="to-list-row">
              <select bind:value={targetListId}>
                {#each lists as l (l.id)}
                  <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
                {/each}
              </select>
              <button class="to-list" onclick={addToList}>🛒 Hinzufügen</button>
            </div>
            {#if addedMessage}<p class="added">{addedMessage}</p>{/if}
          {:else}
            <p class="hint">Noch keine Einkaufsliste, erstell eine im 🛒 Tab</p>
          {/if}
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

  .to-list-row {
    display: flex;
    gap: 8px;
    margin-top: 20px;
  }

  .to-list {
    flex-shrink: 0;
    padding: 10px 16px;
    border: 2px solid var(--accent);
    border-radius: 12px;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .to-list:hover {
    background: var(--accent);
    color: white;
  }

  .added {
    text-align: center;
    color: var(--success);
    margin: 12px 0 0;
  }

  .hint {
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
    margin: 16px 0 0;
  }
</style>