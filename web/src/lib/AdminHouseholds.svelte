<script>
  let households = $state([]);
  let users = $state([]);
  let loading = $state(true);
  let error = $state('');
  let newName = $state('');

  let editingId = $state(null);
  let editName = $state('');
  let editMembers = $state([]);

  async function load() {
    error = '';
    try {
      // Load both at the same time instead of one after the other
      const [hRes, uRes] = await Promise.all([
        fetch('/api/admin/households'),
        fetch('/api/admin/users'),
      ]);
      if (!hRes.ok || !uRes.ok) throw new Error('Haushalte konnten nicht geladen werden');
      households = await hRes.json();
      users = await uRes.json();
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
      const res = await fetch('/api/admin/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Erstellen fehlgeschlagen');
      const data = await res.json();
      newName = '';
      await load();
      const created = households.find((h) => h.id === data.id);
      if (created) startEdit(created);
    } catch (e) {
      error = e.message;
    }
  }

  function startEdit(household) {
    editingId = household.id;
    editName = household.name;
    editMembers = household.members.map((m) => m.id);
  }

  async function saveEdit(household) {
    error = '';
    try {
      if (editName.trim() && editName.trim() !== household.name) {
        const res = await fetch(`/api/admin/households/${household.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName }),
        });
        if (!res.ok) throw new Error('Umbenennen fehlgeschlagen');
      }

      const res = await fetch(`/api/admin/households/${household.id}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: editMembers }),
      });
      if (!res.ok) throw new Error('Mitglieder speichern fehlgeschlagen');

      editingId = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(household) {
    if (!confirm(`Haushalt „${household.name}" und seine Einkaufsliste wirklich löschen?`)) return;
    error = '';
    try {
      const res = await fetch(`/api/admin/households/${household.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      households = households.filter((h) => h.id !== household.id);
    } catch (e) {
      error = e.message;
    }
  }

  load();
</script>

<section class="households">
  <h2>🏠 Haushalte</h2>

  <form class="create" onsubmit={create}>
    <input type="text" bind:value={newName} placeholder="z.B. Familie R." />
    <button type="submit" class="btn-primary small">Erstellen</button>
  </form>

  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if households.length === 0}
    <p class="muted">Noch keine Haushalte</p>
  {:else}
    <ul class="list">
      {#each households as h (h.id)}
        <li class="household">
          {#if editingId === h.id}
            <span class="label">Name</span>
            <input type="text" bind:value={editName} />

            <span class="label spaced">Mitglieder</span>
            <div class="user-grid">
              {#each users as u (u.id)}
                <label class="user-check">
                  <input type="checkbox" value={u.id} bind:group={editMembers} />
                  {u.username}
                </label>
              {/each}
            </div>

            <div class="edit-actions">
              <button class="ghost" onclick={() => (editingId = null)}>Abbrechen</button>
              <button class="btn-primary small" onclick={() => saveEdit(h)}>Speichern</button>
            </div>
          {:else}
            <div class="head">
              <span class="name">{h.name}</span>
              <button class="icon-btn" onclick={() => startEdit(h)} title="Bearbeiten">✏️</button>
              <button class="icon-btn danger" onclick={() => remove(h)} title="Löschen">🗑️</button>
            </div>
            <div class="members">
              {#each h.members as m (m.id)}
                <span class="member">{m.username}</span>
              {:else}
                <span class="no-members">Keine Mitglieder</span>
              {/each}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .households { margin-top: 40px; }

  h2 {
    font-size: 1.5rem;
    margin: 0 0 16px;
    text-align: center;
  }

  .create {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .small {
    padding: 10px 20px;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .muted, .error { text-align: center; }
  .muted { color: var(--muted); }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .household {
    background: var(--card);
    padding: 16px 18px;
    border-radius: 16px;
    box-shadow: var(--shadow);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .name {
    flex: 1;
    font-weight: 600;
    font-size: 1.05rem;
  }

  .icon-btn {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 10px;
    background: none;
    font-size: 1rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .icon-btn:hover {
    opacity: 1;
    background: var(--tag);
  }

  .icon-btn.danger:hover {
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .members {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .member {
    font-size: 0.85rem;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--tag);
  }

  .no-members {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .spaced { margin-top: 16px; }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>