<script>
  import { TIME_LABELS, effortLabel } from './constants.js';
  import RecipeForm from './RecipeForm.svelte';
  import { t } from './i18n.svelte.js';

  let recipes = $state([]);
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let editing = $state(null);
  let creating = $state(false);

  let filtered = $derived(
    recipes.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  // quiet = refresh in the background without showing "Lade…"
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = '';
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error(t('common.loadRecipesFailed'));
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
      if (!res.ok) throw new Error(t('common.loadRecipeFailed'));
      editing = await res.json();
    } catch (e) {
      error = e.message;
    }
  }

  async function toggleDislike(recipe) {
    error = '';
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/dislike`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dislike: !recipe.disliked_by_me }),
      });
      if (!res.ok) throw new Error();
      await load(true);
    } catch {
      error = t('common.notSaved');
    }
  }

  async function remove(recipe) {
    if (!confirm(t('common.confirmDelete', { name: recipe.name }))) return;
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('common.deleteFailed'));
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
      <h1>{t('recipes.title')}</h1>
      <button class="btn-primary new" onclick={() => (creating = true)}>{t('recipes.new')}</button>
    </div>

    <input type="text" bind:value={search} placeholder={t('recipes.search')} class="search" />
    <p class="hint">{t('recipes.dislikeHint')}</p>

    {#if error}<p class="error">{error}</p>{/if}

    {#if loading}
      <p class="muted">{t('common.loading')}</p>
    {:else if recipes.length === 0}
      <p class="muted">{t('recipes.empty')}</p>
    {:else if filtered.length === 0}
      <p class="muted">{t('recipes.notFound', { q: search })}</p>
    {:else}
      <ul class="list">
        {#each filtered as r (r.id)}
          <li class="item">
            <button class="info" onclick={() => edit(r.id)}>
              <span class="name">{r.name}</span>
              <span class="meta">⏱️ {TIME_LABELS[r.time_range]} · {effortLabel(r.difficulty)}</span>
              {#if r.disliked_by.length > 0}
                <span class="dislikes">👎 {r.disliked_by.join(', ')}</span>
              {/if}
            </button>
            <button
              class="dislike"
              class:on={r.disliked_by_me}
              onclick={() => toggleDislike(r)}
              aria-label={t(r.disliked_by_me ? 'recipes.undislike' : 'recipes.dislike')}
              title={t(r.disliked_by_me ? 'recipes.undislike' : 'recipes.dislike')}
            >
              👎
            </button>
            <button class="delete" onclick={() => remove(r)} aria-label={t('common.delete')}>🗑️</button>
          </li>
        {/each}
      </ul>
      <p class="muted count">{t('recipes.count', { n: filtered.length, total: recipes.length })}</p>
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

  .search { margin-bottom: 8px; }

  .hint {
    font-size: 0.85rem;
    color: var(--muted);
    margin: 0 0 16px;
  }

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

  .meta,
  .dislikes {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .dislike,
  .delete {
    width: 52px;
    border: none;
    background: none;
    font-size: 1.1rem;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s, filter 0.15s;
  }

  .dislike {
    opacity: 0.35;
    filter: grayscale(1);
  }

  .dislike:hover { opacity: 0.7; }

  .dislike.on {
    opacity: 1;
    filter: none;
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .delete { opacity: 0.5; }

  .delete:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .count {
    font-size: 0.85rem;
    margin-top: 16px;
  }
</style>