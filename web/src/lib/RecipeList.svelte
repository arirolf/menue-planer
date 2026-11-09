<script>
  import { TIME_LABELS } from './constants.js';
  import RecipeForm from './RecipeForm.svelte';

  let recipes = $state([]);
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let editing = $state(null);
  let creating = $state(false);

  let filtered = $derived(
    recipes.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Rezepte konnten nicht geladen werden');
      recipes = await res.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function edit(id) {
    error = '';
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error('Rezept konnte nicht geladen werden');
      editing = await res.json();
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(recipe) {
    if (!confirm(`„${recipe.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      recipes = recipes.filter((r) => r.id !== recipe.id);
    } catch (e) {
      error = e.message;
    }
  }

  function closeForm() {
    editing = null;
    creating = false;
    load();
  }

  load();
</script>

{#if editing}
  <RecipeForm recipe={editing} onsaved={closeForm} oncancel={closeForm} />
{:else if creating}
  <RecipeForm oncancel={closeForm} />
{:else}
  <div class="page">
    <div class="head">
      <h1>Rezepte</h1>
      <button class="btn-primary new" onclick={() => (creating = true)}>+ Neu</button>
    </div>

    <input type="text" bind:value={search} placeholder="🔍 Suchen…" class="search" />

    {#if loading}
      <p class="muted">Lade…</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if recipes.length === 0}
      <p class="muted">Noch keine Rezepte. Leg mit „+ Neu" eins an!</p>
    {:else if filtered.length === 0}
      <p class="muted">Nichts gefunden für „{search}"</p>
    {:else}
      <ul class="list">
        {#each filtered as r (r.id)}
          <li class="item">
            <button class="info" onclick={() => edit(r.id)}>
              <span class="name">{r.name}</span>
              <span class="meta">⏱️ {TIME_LABELS[r.time_range]} · {'🔪'.repeat(r.difficulty)}</span>
            </button>
            <button class="delete" onclick={() => remove(r)} aria-label="Löschen">🗑️</button>
          </li>
        {/each}
      </ul>
      <p class="muted count">{filtered.length} von {recipes.length} Rezepten</p>
    {/if}
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 2rem;
    margin: 0;
  }

  .new {
    padding: 10px 20px;
    font-size: 1rem;
  }

  .search { margin-bottom: 16px; }

  .muted {
    color: var(--muted);
    text-align: center;
  }

  .error { text-align: center; }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .item {
    display: flex;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 16px 18px;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .info:hover { background: var(--tag); }

  .name {
    font-weight: 600;
    font-size: 1.05rem;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .delete {
    width: 56px;
    border: none;
    background: none;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s, background 0.15s;
  }

  .delete:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .count {
    font-size: 0.85rem;
    margin-top: 16px;
  }
</style>