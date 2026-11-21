<script>
  import ListDetail from './ListDetail.svelte';
  import { t } from './i18n.svelte.js';

  let { currentUser } = $props();

  // Only the first load after opening the tab jumps to the main list; "back" shows the overview
  let jumpToMain = currentUser.open_main_list;

  let lists = $state([]);
  let loading = $state(true);
  let error = $state('');
  let newName = $state('');
  let selectedId = $state(null);

  let householdLists = $derived(lists.filter((l) => l.household_id));
  let myLists = $derived(lists.filter((l) => l.owner_id === currentUser.id));
  let sharedLists = $derived(
    lists.filter((l) => !l.household_id && l.owner_id !== currentUser.id)
  );

  async function load() {
    error = '';
    try {
      const res = await fetch('/api/lists');
      if (!res.ok) throw new Error(t('lists.loadFailed'));
      lists = await res.json();
      if (jumpToMain) {
        jumpToMain = false;
        const main = lists.find((l) => l.household_id);
        if (main) selectedId = main.id;
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function create(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    error = '';
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error(t('common.createFailed'));
      const data = await res.json();
      newName = '';
      selectedId = data.id;
    } catch (e) {
      error = e.message;
    }
  }

  function back() {
    selectedId = null;
    load();
  }

  load();
</script>

{#snippet group(title, items, emptyText)}
  <section class="group">
    <span class="label">{title}</span>
    {#if items.length === 0}
      <p class="empty">{emptyText}</p>
    {:else}
      <ul class="lists">
        {#each items as l (l.id)}
          <li>
            <button class="list-card" onclick={() => (selectedId = l.id)}>
              <span class="text">
                <span class="name">{l.name}</span>
                {#if l.owner_name && l.owner_id !== currentUser.id}
                  <span class="meta">{t('lists.by', { name: l.owner_name })}</span>
                {/if}
              </span>
              <span class="count" class:zero={l.open_count === 0}>{l.open_count}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

{#if selectedId}
  <ListDetail id={selectedId} {currentUser} onback={back} />
{:else}
  <div class="page">
    <h1>{t('lists.title')}</h1>

    {#if error}<p class="error">{error}</p>{/if}

    {#if loading}
      <p class="muted">{t('common.loading')}</p>
    {:else}
      {@render group(t('lists.household'), householdLists, t('lists.noHousehold'))}
      {@render group(t('lists.mine'), myLists, t('lists.noneMine'))}
      {#if sharedLists.length > 0}
        {@render group(t('lists.shared'), sharedLists, '')}
      {/if}

      <form class="create" onsubmit={create}>
        <input type="text" bind:value={newName} placeholder={t('lists.newPlaceholder')} />
        <button type="submit" class="btn-primary small">{t('common.create')}</button>
      </form>
    {/if}
  </div>
{/if}

<style>
  h1 {
    font-size: 2rem;
    margin: 0 0 20px;
    text-align: center;
  }

  .group { margin-bottom: 24px; }

  .empty {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }

  .lists {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .list-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
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

  .list-card:hover { transform: translateY(-2px); }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-weight: 600;
    font-size: 1.05rem;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .count {
    min-width: 32px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    text-align: center;
  }

  .count.zero {
    background: var(--tag);
    color: var(--muted);
  }

  .create {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .small {
    padding: 10px 20px;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .muted, .error { text-align: center; }
  .muted { color: var(--muted); }
</style>