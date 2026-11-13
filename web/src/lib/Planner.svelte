<script>
  import { slide } from 'svelte/transition';
  import RecipeSheet from './RecipeSheet.svelte';
  import { TIME_LABELS, SPECIAL, effortLabel } from './constants.js';
  import { t } from './i18n.svelte.js';
  import { features } from './features.svelte.js';

  const EATERS_KEY = 'menu.eaters';

  // $derived so the labels follow the language
  let timeFilters = $derived([
    { value: 6, label: t('planner.any') },
    { value: 1, label: '≤ 10 min' },
    { value: 2, label: '≤ 20 min' },
    { value: 3, label: '≤ 30 min' },
    { value: 5, label: '≤ 60 min' },
  ]);

  // ANY shows every recipe, Sonntagsessen included
  const ANY = 0;
  let difficultyFilters = $derived([
    { value: ANY, label: t('planner.any') },
    { value: 1, label: '🔪' },
    { value: 2, label: '🔪🔪' },
    { value: SPECIAL, label: t('effort.special') },
  ]);

  let recipes = $state([]);
  let users = $state([]);
  let lists = $state([]);
  let calendars = $state([]);
  let loading = $state(true);
  let error = $state('');

  let search = $state('');
  let maxTime = $state(6);
  let maxDifficulty = $state(ANY);
  let eaters = $state([]);
  let showFilters = $state(false);

  let selectedId = $state(null);
  let rolled = $state(false);
  let spin = $state(0);

  // Everything that matches search + filters, recalculated while you type
  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        r.time_range <= maxTime &&
        // 🔪 / 🔪🔪 = at most that much, the 🎉 chip shows only Sonntagsessen
        (maxDifficulty === ANY ||
          (maxDifficulty === SPECIAL ? r.difficulty === SPECIAL : r.difficulty <= maxDifficulty)) &&
        !r.disliked_by_ids.some((id) => eaters.includes(id)) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q) ||
          r.ingredients.some((name) => name.toLowerCase().includes(q)))
    );
  });

  // Short summary shown on the folded filter button
  let filterSummary = $derived.by(() => {
    const parts = [];
    if (eaters.length > 0) parts.push(`👥 ${eaters.length}`);
    if (maxTime < 6) parts.push(timeFilters.find((f) => f.value === maxTime).label);
    if (maxDifficulty === SPECIAL) parts.push('🎉');
    else if (maxDifficulty !== ANY) parts.push(`max ${'🔪'.repeat(maxDifficulty)}`);
    return parts.join(' · ');
  });

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

  async function load() {
    try {
      const [rRes, uRes, lRes, cRes] = await Promise.all([
        fetch('/api/recipes'),
        fetch('/api/users'),
        fetch('/api/lists'),
        fetch('/api/calendars'),
      ]);
      if (!rRes.ok) throw new Error(t('common.loadRecipesFailed'));
      recipes = await rRes.json();
      if (uRes.ok) {
        users = await uRes.json();
        restoreEaters();
      }
      if (lRes.ok) lists = await lRes.json();
      if (cRes.ok) calendars = await cRes.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // ---------- Picking ----------

  function open(id) {
    rolled = false;
    selectedId = id;
  }

  function surprise() {
    if (filtered.length === 0) return;
    // Don't roll the same recipe twice in a row
    const pool =
      rolled && filtered.length > 1 ? filtered.filter((r) => r.id !== selectedId) : filtered;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    spin += 360;
    rolled = true;
    selectedId = pick.id;
  }

  function close() {
    selectedId = null;
    rolled = false;
  }

  load();
</script>

<div class="page">
  <h1>{t('app.title')}</h1>

  <input
    type="text"
    class="search"
    bind:value={search}
    placeholder={t('planner.search')}
  />

  <button class="filter-toggle" onclick={() => (showFilters = !showFilters)}>
    <span>{t('planner.filter')}</span>
    {#if filterSummary}<span class="summary">{filterSummary}</span>{/if}
    <span class="arrow">{showFilters ? '▲' : '▼'}</span>
  </button>

  {#if showFilters}
    <section class="filters" transition:slide={{ duration: 200 }}>
      {#if users.length > 0}
        <div>
          <span class="label">{t('planner.eaters')}</span>
          <div class="chips">
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
        <span class="label">{t('common.time')}</span>
        <div class="chips">
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
        <span class="label">{t('planner.maxEffort')}</span>
        <div class="chips">
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
  {/if}

  <button class="dice" onclick={surprise} disabled={loading || filtered.length === 0}>
    <span class="dice-icon" style="transform: rotate({spin}deg)">🎲</span>
    {t('planner.surprise')}
  </button>

  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">{t('common.loading')}</p>
  {:else if recipes.length === 0}
    <p class="muted">{t('planner.noRecipes')}</p>
  {:else if filtered.length === 0}
    <p class="muted">{t('planner.noMatch')}</p>
  {:else}
    <p class="count">{t(filtered.length === 1 ? 'planner.matchOne' : 'planner.matchMany', { n: filtered.length })}</p>
    <ul class="results">
      {#each filtered as r (r.id)}
        <li>
          <button class="result" onclick={() => open(r.id)}>
            <span class="text">
              <span class="name">{r.name}</span>
              <span class="meta">⏱️ {TIME_LABELS[r.time_range]} · {effortLabel(r.difficulty)}</span>
              {#if features.recipeChecks && !r.checked}<span class="unchecked">{t('recipe.unchecked')}</span>{/if}
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if selectedId}
  <RecipeSheet
    recipeId={selectedId}
    {calendars}
    {lists}
    onclose={close}
    onreroll={rolled ? surprise : null}
    onchecked={(id, checked) => {
      const r = recipes.find((x) => x.id === id);
      if (r) r.checked = checked;
    }}
  />
{/if}

<style>
  h1 {
    font-size: 2rem;
    margin: 0 0 16px;
    text-align: center;
  }

  .search { margin-bottom: 10px; }

  .filter-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border: 2px solid var(--tag);
    border-radius: 14px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .summary {
    flex: 1;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .arrow {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 10px;
    padding: 16px;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow);
  }

  .dice {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 18px 0 8px;
    padding: 18px;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-size: 1.15rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }

  .dice:hover:not(:disabled) { background: var(--accent-hover); }
  .dice:active:not(:disabled) { transform: scale(0.97); }
  .dice:disabled { opacity: 0.5; cursor: default; }

  .dice-icon {
    display: inline-block;
    font-size: 1.5rem;
    transition: transform 0.5s ease-out;
  }

  .error { text-align: center; }

  .muted {
    color: var(--muted);
    text-align: center;
  }

  .count {
    margin: 16px 4px 8px;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .results {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .result {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 14px 18px;
    border: none;
    border-radius: 16px;
    background: var(--card);
    box-shadow: var(--shadow);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .result:hover { transform: translateY(-2px); }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    font-weight: 600;
    font-size: 1.05rem;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .unchecked {
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    font-size: 0.8rem;
  }

  .chevron {
    font-size: 1.5rem;
    color: var(--muted);
  }
</style>