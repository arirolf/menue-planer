<script>
  import { t } from './i18n.svelte.js';

  let { onlogin } = $props();

  let username = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  async function submit(event) {
    event.preventDefault();
    error = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 401) throw new Error(t('login.wrong'));
      if (!res.ok) throw new Error(t('login.failed'));
      onlogin(await res.json());
    } catch (e) {
      error = e.message;
      password = '';
    } finally {
      loading = false;
    }
  }
</script>

<div class="wrapper">
  <form class="card" onsubmit={submit}>
    <div class="logo">🍽️</div>
    <h1>{t('app.title')}</h1>
    <p class="subtitle">{t('login.subtitle')}</p>

    <div class="field">
      <label class="label" for="username">{t('login.username')}</label>
      <input
        id="username"
        type="text"
        bind:value={username}
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
    </div>

    <div class="field">
      <label class="label" for="password">{t('login.password')}</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        required
      />
    </div>

    <button type="submit" class="btn-primary login" disabled={loading}>
      {loading ? t('login.submitting') : t('login.submit')}
    </button>

    {#if error}<p class="error">{error}</p>{/if}
  </form>
</div>

<style>
  .wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .card {
    width: 100%;
    max-width: 380px;
    background: var(--card);
    padding: 36px 28px;
    border-radius: 24px;
    box-shadow: var(--shadow);
    text-align: center;
  }

  .logo { font-size: 3rem; }

  h1 {
    margin: 8px 0 4px;
    font-size: 1.8rem;
  }

  .subtitle {
    color: var(--muted);
    margin: 0 0 28px;
  }

  .field {
    text-align: left;
    margin-bottom: 18px;
  }

  .login {
    width: 100%;
    margin-top: 8px;
  }

  .error { margin: 16px 0 0; }
</style>