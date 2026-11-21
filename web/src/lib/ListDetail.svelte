<script>
  import { t } from './i18n.svelte.js';
  import { formatShort } from './dates.js';
  import { categoryName, categoryOrder } from './categories.js';
  import SortPanel from './SortPanel.svelte';
  let { id, currentUser, onback } = $props();

  let list = $state(null);
  let loading = $state(true);
  let error = $state('');
  let newName = $state('');
  let newAmount = $state('');

  let showSettings = $state(false);
  let allUsers = $state([]);
  let shareIds = $state([]);
  let renameValue = $state('');
  let transferTo = $state('');

  let isOwner = $derived(list?.owner_id === currentUser.id);
  let isHousehold = $derived(Boolean(list?.household_id));
  let open = $derived(list ? list.items.filter((i) => !i.checked) : []);

  // Categories and stores (shared by everyone), for grouping the open items
  let shop = $state({ categories: [], stores: [] });
  let showSort = $state(false);
  // null = all, a category id, or 'none' for items without a category
  let filter = $state(null);
  // Item whose category picker is open
  let tagging = $state(null);

  let byId = $derived(new Map(shop.categories.map((c) => [c.id, c])));
  let order = $derived(categoryOrder(shop, list?.store_id ?? null));
  let filtered = $derived(
    open.filter((i) => filter === null || (filter === 'none' ? !byId.has(i.category_id) : i.category_id === filter))
  );
  // Pinned items first, then one group per category in the store's order, then the rest
  let groups = $derived.by(() => {
    const result = [];
    const pinned = filtered.filter((i) => i.pinned);
    if (pinned.length) result.push({ key: 'pinned', title: t('list.pinned'), items: pinned });
    const rest = filtered.filter((i) => !i.pinned);
    for (const id of order) {
      const items = rest.filter((i) => i.category_id === id);
      const c = byId.get(id);
      if (items.length && c) result.push({ key: id, title: `${c.emoji ?? ''} ${categoryName(c)}`, items });
    }
    const other = rest.filter((i) => !byId.has(i.category_id));
    if (other.length) result.push({ key: 'none', title: t('list.noCategory'), items: other });
    return result;
  });
  // Filter chips only for categories that have open items
  let chips = $derived(
    order
      .map((id) => byId.get(id))
      .filter((c) => c && open.some((i) => i.category_id === c.id))
  );
  let hasUntagged = $derived(open.some((i) => !byId.has(i.category_id)));
  let done = $derived(list ? list.items.filter((i) => i.checked) : []);
  let otherUsers = $derived(allUsers.filter((u) => u.id !== currentUser.id));

  // Small helper so every request doesn't need the same 10 lines
  async function api(path, method, body) {
    const res = await fetch(`/api/lists/${id}${path}`, {
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

  async function load() {
    try {
      const res = await fetch(`/api/lists/${id}`);
      if (res.status === 404) return onback();
      if (!res.ok) throw new Error(t('list.loadFailed'));
      const data = await res.json();
      list = data;
      renameValue = data.name;
      shareIds = data.members.map((m) => m.id);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Only refreshes the items, so open settings don't get reset
  async function refreshItems() {
    try {
      const res = await fetch(`/api/lists/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (list) {
        list.items = data.items;
        list.store_id = data.store_id;
      }
    } catch {
      // offline for a moment? just try again next time
    }
  }

  // Check every 10 seconds whether someone else changed the list
  $effect(() => {
    const timer = setInterval(refreshItems, 10000);
    return () => clearInterval(timer);
  });

  async function loadShop() {
    try {
      const res = await fetch('/api/shop');
      if (res.ok) shop = await res.json();
    } catch {
      // the list still works unsorted
    }
  }

  async function pickStore(storeId) {
    const before = list.store_id;
    list.store_id = storeId;
    try {
      await api('/store', 'PUT', { store_id: storeId });
    } catch (e) {
      list.store_id = before;
      error = e.message;
    }
  }

  // Remembered for this item name on every list, so all matching items move
  async function setCategory(item, categoryId) {
    tagging = null;
    try {
      const res = await fetch('/api/item-tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name, category_id: categoryId }),
      });
      if (!res.ok) throw new Error();
      const key = item.name.trim().toLocaleLowerCase('de');
      for (const i of list.items) {
        if (i.name.trim().toLocaleLowerCase('de') === key) i.category_id = categoryId;
      }
    } catch {
      error = t('common.notSaved');
    }
  }

  async function togglePin(item) {
    item.pinned = !item.pinned;
    try {
      await api(`/items/${item.id}`, 'PATCH', { pinned: item.pinned });
    } catch {
      item.pinned = !item.pinned;
      error = t('common.notSaved');
    }
  }

  async function addItem(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    error = '';
    try {
      await api('/items', 'POST', { name: newName, amount: newAmount });
      newName = '';
      newAmount = '';
      await refreshItems();
    } catch (e) {
      error = e.message;
    }
  }

  async function toggle(item) {
    item.checked = !item.checked;
    try {
      await api(`/items/${item.id}`, 'PATCH', { checked: item.checked });
    } catch {
      item.checked = !item.checked;
      error = t('common.notSaved');
    }
  }

  async function removeItem(item) {
    try {
      await api(`/items/${item.id}`, 'DELETE');
      list.items = list.items.filter((i) => i.id !== item.id);
    } catch (e) {
      error = e.message;
    }
  }

  async function clearDone() {
    try {
      await api('/checked', 'DELETE');
      list.items = list.items.filter((i) => !i.checked);
    } catch (e) {
      error = e.message;
    }
  }

  async function toggleSettings() {
    showSettings = !showSettings;
    if (showSettings && allUsers.length === 0) {
      try {
        const res = await fetch('/api/users');
        if (res.ok) allUsers = await res.json();
      } catch {
        error = t('common.loadUsersFailed');
      }
    }
  }

  async function rename() {
    if (!renameValue.trim()) return;
    try {
      await api('', 'PATCH', { name: renameValue });
      list.name = renameValue.trim();
    } catch (e) {
      error = e.message;
    }
  }

  async function saveShares() {
    try {
      await api('/members', 'PUT', { user_ids: shareIds });
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function transfer() {
    const target = otherUsers.find((u) => u.id === Number(transferTo));
    if (!target) return;
    if (!confirm(t('list.confirmTransfer', { name: list.name, user: target.username }))) return;
    try {
      await api('/transfer', 'POST', { user_id: target.id });
      showSettings = false;
      transferTo = '';
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function deleteList() {
    if (!confirm(t('common.confirmDelete', { name: list.name }))) return;
    try {
      await api('', 'DELETE');
      onback();
    } catch (e) {
      error = e.message;
    }
  }

  async function leave() {
    if (!confirm(t('list.confirmLeave', { name: list.name }))) return;
    try {
      await api('/leave', 'POST');
      onback();
    } catch (e) {
      error = e.message;
    }
  }

  load();
  loadShop();
</script>

<!-- Where an item came from: recipe, which day, how many people -->
{#snippet source(item)}
  {#if item.recipe_name || item.planned_date || item.servings}
    <span class="source">
      {#if item.recipe_name}<span>🍽️ {item.recipe_name}</span>{/if}
      {#if item.planned_date}
        <span class="pill" title={t('list.plannedFor', { date: formatShort(item.planned_date) })}>
          📅 {formatShort(item.planned_date)}
        </span>
      {/if}
      {#if item.servings}
        <span class="pill" title={t('list.peopleCount', { n: item.servings })}>👥 {item.servings}</span>
      {/if}
    </span>
  {/if}
{/snippet}

<div class="page">
  <div class="topline">
    <button class="back" onclick={onback}>{t('list.all')}</button>
    {#if list && !isHousehold}
      <button
        class="gear"
        class:active={showSettings}
        onclick={toggleSettings}
        aria-label={t('app.settings')}
      >
        ⚙️
      </button>
    {/if}
  </div>

  {#if loading}
    <p class="muted">{t('common.loading')}</p>
  {:else if list}
    <h1>{list.name}</h1>
    <p class="sub">
      {#if isHousehold}
        {t('list.householdList')}
      {:else if isOwner}
        {t('list.yours')}
      {:else}
        {t('list.byOwner', { name: list.owner_name })}
      {/if}
      {#if list.members.length > 0}
        · {isHousehold ? '' : `${t('list.sharedWith')} `}{list.members.map((m) => m.username).join(', ')}
      {/if}
    </p>

    {#if showSettings}
      <section class="settings">
        {#if isOwner}
          <div class="setting">
            <span class="label">{t('common.name')}</span>
            <div class="row">
              <input type="text" bind:value={renameValue} />
              <button class="ghost" onclick={rename}>{t('common.save')}</button>
            </div>
          </div>

          <div class="setting">
            <span class="label">{t('list.shareWith')}</span>
            {#if otherUsers.length === 0}
              <p class="muted left">{t('list.noOtherUsers')}</p>
            {:else}
              <div class="user-grid">
                {#each otherUsers as u (u.id)}
                  <label class="user-check">
                    <input type="checkbox" value={u.id} bind:group={shareIds} />
                    {u.username}
                  </label>
                {/each}
              </div>
              <button class="ghost" onclick={saveShares}>{t('list.saveShares')}</button>
            {/if}
          </div>

          <div class="setting">
            <span class="label">{t('list.transfer')}</span>
            <div class="row">
              <select bind:value={transferTo}>
                <option value="">{t('list.pickPerson')}</option>
                {#each otherUsers as u (u.id)}
                  <option value={u.id}>{u.username}</option>
                {/each}
              </select>
              <button class="ghost" onclick={transfer} disabled={!transferTo}>{t('list.transferButton')}</button>
            </div>
          </div>

          <button class="danger-btn" onclick={deleteList}>{t('list.delete')}</button>
        {:else}
          <button class="danger-btn" onclick={leave}>{t('list.leave')}</button>
        {/if}
      </section>
    {/if}

    <form class="add-row" onsubmit={addItem}>
      <input type="text" class="amount" bind:value={newAmount} placeholder={t('list.amount')} />
      <input type="text" bind:value={newName} placeholder={t('list.whatsMissing')} />
      <button type="submit" class="add-btn" aria-label={t('common.add')}>+</button>
    </form>

    {#if error}<p class="error">{error}</p>{/if}

    {#if list.items.length === 0}
      <p class="muted">{t('list.empty')}</p>
    {:else}
      {#if open.length > 0}
        <div class="toolbar">
          <select
            value={list.store_id ?? ''}
            onchange={(e) => pickStore(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
            aria-label={t('list.store')}
          >
            <option value="">{t('list.defaultOrder')}</option>
            {#each shop.stores as store (store.id)}
              <option value={store.id}>🏪 {store.name}</option>
            {/each}
          </select>
          <button class="sort-btn" class:active={showSort} onclick={() => (showSort = !showSort)}>
            {t('list.sort')}
          </button>
        </div>

        {#if showSort}
          <SortPanel {shop} storeId={list.store_id ?? null} onchange={loadShop} onpickstore={pickStore} />
        {/if}

        {#if chips.length > 0}
          <div class="chips">
            <button class="chip" class:on={filter === null} onclick={() => (filter = null)}>{t('list.filterAll')}</button>
            {#each chips as c (c.id)}
              <button class="chip" class:on={filter === c.id} onclick={() => (filter = filter === c.id ? null : c.id)}>
                {c.emoji ?? ''} {categoryName(c)}
              </button>
            {/each}
            {#if hasUntagged}
              <button class="chip" class:on={filter === 'none'} onclick={() => (filter = filter === 'none' ? null : 'none')}>
                {t('list.noCategory')}
              </button>
            {/if}
          </div>
        {/if}

        {#if filtered.length === 0}
          <p class="muted">{t('list.nothingInFilter')}</p>
        {/if}
        {#each groups as group (group.key)}
          {#if groups.length > 1 || group.key !== 'none'}
            <span class="label group-title">{group.title}</span>
          {/if}
          <ul class="items">
            {#each group.items as item (item.id)}
              <li class="item">
                <div class="item-row">
                  <button class="check" onclick={() => toggle(item)} aria-label={t('list.check')}></button>
                  <span class="text">
                    {#if item.quantity > 1}<span class="count">{item.quantity}×</span>{/if}
                    {#if item.amount}<span class="qty">{item.amount}</span>{/if}
                    {item.name}
                    {@render source(item)}
                  </span>
                  <button
                    class="mini"
                    class:faint={!byId.has(item.category_id)}
                    class:active={tagging === item.id}
                    onclick={() => (tagging = tagging === item.id ? null : item.id)}
                    aria-label={t('list.setCategory')}
                    title={t('list.setCategory')}
                  >
                    {byId.get(item.category_id)?.emoji ?? '🏷️'}
                  </button>
                  <button
                    class="mini"
                    class:faint={!item.pinned}
                    onclick={() => togglePin(item)}
                    aria-label={item.pinned ? t('list.unpin') : t('list.pin')}
                    title={item.pinned ? t('list.unpin') : t('list.pin')}
                  >
                    📌
                  </button>
                  <button class="delete" onclick={() => removeItem(item)} aria-label={t('common.delete')}>✕</button>
                </div>
                {#if tagging === item.id}
                  <div class="picker">
                    {#each order as id (id)}
                      {@const c = byId.get(id)}
                      {#if c}
                        <button class="chip" class:on={item.category_id === c.id} onclick={() => setCategory(item, c.id)}>
                          {c.emoji ?? ''} {categoryName(c)}
                        </button>
                      {/if}
                    {/each}
                    {#if byId.has(item.category_id)}
                      <button class="chip" onclick={() => setCategory(item, null)}>✕ {t('list.noCategory')}</button>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}

      {#if done.length > 0}
        <div class="done-header">
          <span class="label">{t('list.inBasket', { n: done.length })}</span>
          <button class="clear" onclick={clearDone}>{t('list.clear')}</button>
        </div>
        <ul class="items">
          {#each done as item (item.id)}
            <li class="item checked">
              <button class="check on" onclick={() => toggle(item)} aria-label={t('list.uncheck')}>✓</button>
              <span class="text">
                {#if item.quantity > 1}<span class="count">{item.quantity}×</span>{/if}
                    {#if item.amount}<span class="qty">{item.amount}</span>{/if}
                {item.name}
                {@render source(item)}
              </span>
              <button class="delete" onclick={() => removeItem(item)} aria-label={t('common.delete')}>✕</button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .topline {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .back,
  .gear {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 10px;
  }

  .back:hover,
  .gear:hover,
  .gear.active {
    background: var(--tag);
    color: var(--text);
  }

  .gear { font-size: 1.2rem; }

  h1 {
    font-size: 2rem;
    margin: 0 0 4px;
    text-align: center;
  }

  .sub {
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0 0 20px;
  }

  .settings {
    background: var(--card);
    padding: 20px;
    border-radius: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 20px;
  }

  .setting { margin-bottom: 20px; }

  .row {
    display: flex;
    gap: 8px;
  }

  .danger-btn {
    width: 100%;
    padding: 10px;
    border: 2px solid var(--error);
    border-radius: 999px;
    background: none;
    color: var(--error);
    font: inherit;
    cursor: pointer;
  }

  .danger-btn:hover {
    background: var(--error);
    color: white;
  }

  .add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .add-row .amount { width: 90px; flex-shrink: 0; }

  .add-btn {
    flex-shrink: 0;
    width: 48px;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 1.5rem;
    cursor: pointer;
  }

  .muted {
    color: var(--muted);
    text-align: center;
  }

  .muted.left {
    text-align: left;
    margin: 0 0 8px;
  }

  .error { text-align: center; }

  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    background: var(--card);
    border-radius: 16px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 8px 12px 16px;
    border-bottom: 1px solid var(--tag);
  }

  /* Open items: the row plus an optional category picker below it */
  .item:has(.item-row) {
    display: block;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .item-row .text { margin-left: 4px; }

  .mini {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    font-size: 1rem;
    cursor: pointer;
  }

  .mini:hover,
  .mini.active { background: var(--tag); }
  .mini.faint { opacity: 0.3; }
  .mini.faint:hover { opacity: 0.8; }

  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 2px 38px;
  }

  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .toolbar select { flex: 1; min-width: 0; }

  .sort-btn {
    flex-shrink: 0;
    padding: 0 14px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .sort-btn:hover,
  .sort-btn.active { border-color: var(--accent); }

  .chips {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 12px;
  }

  .chip {
    flex-shrink: 0;
    padding: 5px 12px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .chip.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }

  .group-title {
    display: block;
    margin: 16px 4px 6px;
  }

  .group-title:first-of-type { margin-top: 4px; }

  .item:last-child { border-bottom: none; }

  .check {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border: 2px solid var(--muted);
    border-radius: 50%;
    background: none;
    color: white;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .check:hover { border-color: var(--accent); }

  .check.on {
    background: var(--success);
    border-color: var(--success);
  }

  .text { flex: 1; }

  .qty {
    color: var(--muted);
    margin-right: 6px;
  }

  /* "2×" from adding a Basic several times */
  .count {
    font-weight: 700;
    margin-right: 6px;
  }

  .checked .text {
    text-decoration: line-through;
    color: var(--muted);
  }

  .delete {
    border: none;
    background: none;
    color: var(--muted);
    font-size: 1rem;
    padding: 6px 10px;
    cursor: pointer;
    opacity: 0.5;
  }

  .delete:hover {
    opacity: 1;
    color: var(--error);
  }

  .done-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 24px 4px 8px;
  }

  .done-header .label { margin: 0; }

  .clear {
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .pill {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--tag);
    white-space: nowrap;
  }

  .source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 3px;
    font-size: 0.78rem;
    color: var(--muted);
  }
</style>