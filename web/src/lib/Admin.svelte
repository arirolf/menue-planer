<script>
  let { currentUser } = $props();

  let users = $state([]);
  let loading = $state(true);
  let error = $state('');

  let newUsername = $state('');
  let newIsAdmin = $state(false);
  let creating = $state(false);

  // Shows a freshly generated password once
  let revealed = $state(null);
  let copied = $state(false);

  async function load() {
    error = '';
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Benutzer konnten nicht geladen werden');
      users = await res.json();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function create(event) {
    event.preventDefault();
    error = '';
    creating = true;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, is_admin: newIsAdmin }),
      });
      const data = await res.json();
      if (res.status === 409) throw new Error('Dieser Benutzername ist schon vergeben');
      if (res.status === 400) throw new Error('Nur a–z, 0–9, _ und -, 2–30 Zeichen');
      if (!res.ok) throw new Error('Erstellen fehlgeschlagen');

      revealed = { username: data.username, password: data.password };
      copied = false;
      newUsername = '';
      newIsAdmin = false;
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      creating = false;
    }
  }

  async function resetPassword(user) {
    if (!confirm(`Neues Passwort für „${user.username}" erstellen? Das alte funktioniert dann nicht mehr.`)) return;
    error = '';
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
      if (!res.ok) throw new Error('Zurücksetzen fehlgeschlagen');
      const data = await res.json();
      revealed = { username: user.username, password: data.password };
      copied = false;
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(user) {
    if (!confirm(`„${user.username}" wirklich löschen? Die Rezepte bleiben erhalten.`)) return;
    error = '';
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      users = users.filter((u) => u.id !== user.id);
    } catch (e) {
      error = e.message;
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(revealed.password);
      copied = true;
    } catch {
      error = 'Kopieren geht erst über HTTPS, bitte abschreiben';
    }
  }

  function formatDate(text) {
    return new Date(text.replace(' ', 'T') + 'Z').toLocaleDateString('de-CH');
  }

  load();
</script>

<div class="page">
  <h1>👑 Benutzer</h1>

  <form class="create" onsubmit={create}>
    <span class="label">Neuer Benutzer</span>
    <div class="create-row">
      <input
        type="text"
        bind:value={newUsername}
        placeholder="z.B. papi"
        autocapitalize="none"
        spellcheck="false"
        required
      />
      <button type="submit" class="btn-primary small" disabled={creating}>
        {creating ? '…' : 'Erstellen'}
      </button>
    </div>
    <label class="checkbox">
      <input type="checkbox" bind:checked={newIsAdmin} />
      Admin-Rechte
    </label>
  </form>

  {#if revealed}
    <div class="reveal">
      <p>Passwort für <strong>{revealed.username}</strong>:</p>
      <code>{revealed.password}</code>
      <div class="reveal-actions">
        <button class="ghost" onclick={copyPassword}>{copied ? '✓ Kopiert' : '📋 Kopieren'}</button>
        <button class="ghost" onclick={() => (revealed = null)}>Fertig</button>
      </div>
      <p class="hint">⚠️ Wird nur einmal angezeigt. Jetzt weitergeben oder aufschreiben!</p>
    </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <p class="muted">Lade…</p>
  {:else}
    <ul class="list">
      {#each users as user (user.id)}
        {@const isMe = user.id === currentUser.id}
        <li class="item">
          <div class="info">
            <span class="name">
              {user.username}
              {#if user.is_admin}<span class="badge">👑 Admin</span>{/if}
              {#if isMe}<span class="badge me">Du</span>{/if}
            </span>
            <span class="meta">seit {formatDate(user.created_at)}</span>
          </div>
          <button class="icon-btn" onclick={() => resetPassword(user)} title="Passwort zurücksetzen">🔑</button>
          <button class="icon-btn danger" onclick={() => remove(user)} disabled={isMe} title="Löschen">🗑️</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  h1 {
    font-size: 2rem;
    margin: 0 0 20px;
    text-align: center;
  }

  .create {
    background: var(--card);
    padding: 20px;
    border-radius: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 20px;
  }

  .create-row {
    display: flex;
    gap: 8px;
  }

  .small {
    padding: 10px 20px;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    color: var(--muted);
    cursor: pointer;
  }

  .checkbox input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }

  .reveal {
    background: color-mix(in srgb, var(--success) 12%, var(--card));
    border: 2px solid var(--success);
    padding: 20px;
    border-radius: 20px;
    margin-bottom: 20px;
    text-align: center;
  }

  .reveal p { margin: 0 0 10px; }

  code {
    display: inline-block;
    font-size: 1.4rem;
    letter-spacing: 0.05em;
    padding: 8px 16px;
    background: var(--card);
    border-radius: 10px;
    user-select: all;
  }

  .reveal-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin: 14px 0 10px;
  }

  .ghost {
    padding: 8px 16px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .hint {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .error, .muted { text-align: center; }
  .muted { color: var(--muted); }

  .list {
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
    gap: 4px;
    padding: 12px 8px 12px 18px;
    border-bottom: 1px solid var(--tag);
  }

  .item:last-child { border-bottom: none; }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.72rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--tag);
    color: var(--muted);
  }

  .badge.me {
    background: var(--accent);
    color: white;
  }

  .meta {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: none;
    font-size: 1.05rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .icon-btn:hover:not(:disabled) {
    opacity: 1;
    background: var(--tag);
  }

  .icon-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 15%, transparent);
  }

  .icon-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }
</style>