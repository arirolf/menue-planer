<script>
  import { t } from './i18n.svelte.js';
  import { formatShort } from './dates.js';
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
      if (list) list.items = data.items;
    } catch {
      // offline for a moment? just try again next time
    }
  }

  // Check every 10 seconds whether someone else changed the list
  $effect(() => {
    const timer = setInterval(refreshItems, 10000);
    return () => clearInterval(timer);
  });

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
        <ul class="items">
          {#each open as item (item.id)}
            <li class="item">
              <button class="check" onclick={() => toggle(item)} aria-label={t('list.check')}></button>
              <span class="text">
                {#if item.amount}<span class="qty">{item.amount}</span>{/if}
                {item.name}
                {@render source(item)}
              </span>
              <button class="delete" onclick={() => removeItem(item)} aria-label={t('common.delete')}>✕</button>
            </li>
          {/each}
        </ul>
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