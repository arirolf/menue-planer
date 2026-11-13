<script>
  import { t } from './i18n.svelte.js';
  import { categoryName, categoryOrder } from './categories.js';

  // shop = { categories, stores } from /api/shop; storeId = the store the list sorts by (null = default).
  // onchange reloads shop data, onpickstore switches the list to another store.
  let { shop, storeId, onchange, onpickstore } = $props();

  let error = $state('');
  let editingId = $state(null);
  let editName = $state('');
  let editEmoji = $state('');
  let newName = $state('');
  let newEmoji = $state('');
  let newStore = $state('');
  let storeName = $state('');

  let store = $derived(shop.stores.find((s) => s.id === storeId) ?? null);
  let ordered = $derived(
    categoryOrder(shop, storeId)
      .map((id) => shop.categories.find((c) => c.id === id))
      .filter(Boolean)
  );

  $effect(() => {
    storeName = store?.name ?? '';
  });

  async function api(path, method, body) {
    error = '';
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || t('common.genericError'));
    }
    return res.status === 204 ? null : res.json();
  }

  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      error = e.message;
    }
    await onchange();
  }

  // Swap with the neighbour: "this before that"
  function move(index, direction) {
    const ids = ordered.map((c) => c.id);
    const other = index + direction;
    if (other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    run(() => api(store ? `/stores/${store.id}/order` : '/categories/order', 'PUT', { ids }));
  }

  function startEdit(category) {
    editingId = category.id;
    editName = categoryName(category);
    editEmoji = category.emoji ?? '';
  }

  function saveEdit(event) {
    event.preventDefault();
    const id = editingId;
    editingId = null;
    run(() => api(`/categories/${id}`, 'PATCH', { name: editName, emoji: editEmoji }));
  }

  function remove(category) {
    if (!confirm(t('sort.confirmDeleteCategory', { name: categoryName(category) }))) return;
    run(() => api(`/categories/${category.id}`, 'DELETE'));
  }

  function addCategory(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await api('/categories', 'POST', { name: newName, emoji: newEmoji });
      newName = '';
      newEmoji = '';
    });
  }

  function addStore(event) {
    event.preventDefault();
    if (!newStore.trim()) return;
    run(async () => {
      const { id } = await api('/stores', 'POST', { name: newStore });
      newStore = '';
      await onpickstore(id);
    });
  }

  function renameStore(event) {
    event.preventDefault();
    if (!storeName.trim()) return;
    run(() => api(`/stores/${store.id}`, 'PATCH', { name: storeName }));
  }

  function deleteStore() {
    if (!confirm(t('common.confirmDelete', { name: store.name }))) return;
    run(async () => {
      await api(`/stores/${store.id}`, 'DELETE');
      await onpickstore(null);
    });
  }
</script>

<section class="panel">
  <span class="label">
    {store ? t('sort.orderFor', { name: store.name }) : t('sort.defaultOrder')}
  </span>
  <p class="hint">{t('sort.hint')}</p>

  <ol class="cats">
    {#each ordered as category, i (category.id)}
      <li>
        {#if editingId === category.id}
          <form class="row" onsubmit={saveEdit}>
            <input class="emoji" type="text" bind:value={editEmoji} aria-label={t('sort.emoji')} />
            <input type="text" bind:value={editName} aria-label={t('common.name')} />
            <button class="small" type="submit">{t('common.save')}</button>
          </form>
        {:else}
          <span class="pos">{i + 1}</span>
          <span class="name">{category.emoji ?? ''} {categoryName(category)}</span>
          <button class="icon" disabled={i === 0} onclick={() => move(i, -1)} aria-label={t('sort.up')}>↑</button>
          <button class="icon" disabled={i === ordered.length - 1} onclick={() => move(i, 1)} aria-label={t('sort.down')}>↓</button>
          <button class="icon" onclick={() => startEdit(category)} aria-label={t('sort.edit')}>✏️</button>
          <button class="icon" onclick={() => remove(category)} aria-label={t('common.delete')}>🗑️</button>
        {/if}
      </li>
    {/each}
  </ol>

  <form class="row" onsubmit={addCategory}>
    <input class="emoji" type="text" bind:value={newEmoji} placeholder="🧀" aria-label={t('sort.emoji')} />
    <input type="text" bind:value={newName} placeholder={t('sort.newCategory')} />
    <button class="small" type="submit">{t('common.add')}</button>
  </form>

  <span class="label stores-label">{t('sort.stores')}</span>
  {#if store}
    <form class="row" onsubmit={renameStore}>
      <input type="text" bind:value={storeName} aria-label={t('common.name')} />
      <button class="small" type="submit">{t('common.save')}</button>
      <button class="small danger" type="button" onclick={deleteStore}>🗑️</button>
    </form>
  {/if}
  <form class="row" onsubmit={addStore}>
    <input type="text" bind:value={newStore} placeholder={t('sort.newStore')} />
    <button class="small" type="submit">{t('common.add')}</button>
  </form>

  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .panel {
    background: var(--card);
    padding: 20px;
    border-radius: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 20px;
  }

  .hint {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 12px;
  }

  .cats {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }

  .cats li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid var(--tag);
  }

  .pos {
    width: 20px;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .name {
    flex: 1;
    min-width: 0;
  }

  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex: 1;
  }

  .row input { flex: 1; min-width: 0; }
  .row .emoji { flex: 0 0 52px; text-align: center; }

  .icon {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .icon:hover:not(:disabled) { border-color: var(--accent); }
  .icon:disabled { opacity: 0.3; cursor: default; }

  .small {
    flex-shrink: 0;
    padding: 0 14px;
    border: 2px solid var(--accent);
    border-radius: 999px;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }

  .small.danger { border-color: var(--error); }

  .stores-label {
    display: block;
    margin-top: 16px;
  }

  .error { margin: 8px 0 0; }
</style>
