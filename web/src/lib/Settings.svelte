<script>
  let { user, onsave, onback } = $props();

  const LANGUAGES = [
    { id: 'de', label: '🇩🇪 Deutsch' },
    { id: 'en', label: '🇬🇧 English' },
  ];

  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  // Sends only the changed fields; the server answers with the updated user
  async function save(changes) {
    error = '';
    saved = false;
    saving = true;
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      onsave(await res.json());
      saved = true;
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <button class="back" onclick={onback}>← Zurück</button>
  <h1>⚙️ Einstellungen</h1>

  <section class="card">
    <span class="label">Sprache</span>
    <div class="chips">
      {#each LANGUAGES as lang}
        <button
          class="chip"
          class:active={user.language === lang.id}
          disabled={saving}
          onclick={() => user.language !== lang.id && save({ language: lang.id })}
        >
          {lang.label}
        </button>
      {/each}
    </div>
  </section>

  {#if error}<p class="error">{error}</p>{/if}
  {#if saved}<p class="success">Gespeichert ✓</p>{/if}
</div>

<style>
  .back {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 6px 10px;
    margin-left: -10px;
    border-radius: 8px;
  }
  .back:hover {
    background: var(--tag);
    color: var(--text);
  }

  h1 {
    font-size: 2rem;
    margin: 8px 0 20px;
    text-align: center;
  }

  .card {
    background: var(--card);
    padding: 20px;
    border-radius: 20px;
    box-shadow: var(--shadow);
    margin-bottom: 16px;
  }

  p {
    text-align: center;
    margin: 0;
  }
</style>
