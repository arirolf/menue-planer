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

  async function roll() {
    loading = true;
    error = '';
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
</style>