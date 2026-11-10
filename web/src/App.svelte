<script>
  import Login from './lib/Login.svelte';
  import Planner from './lib/Planner.svelte';
  import RecipeList from './lib/RecipeList.svelte';
  import Calendar from './lib/Calendar.svelte';
  import Lists from './lib/Lists.svelte';
  import Admin from './lib/Admin.svelte';
  import AdminHouseholds from './lib/AdminHouseholds.svelte';
  import AdminCalendars from './lib/AdminCalendars.svelte';
  import Settings from './lib/Settings.svelte';
  import { t, setLanguage } from './lib/i18n.svelte.js';
  import { applyColors } from './lib/theme.js';

  let user = $state(null);
  let checking = $state(true);
  let page = $state('roll');
  // Tab to return to when leaving the settings
  let lastTab = $state('roll');

  function openSettings() {
    if (page !== 'settings') lastTab = page;
    page = 'settings';
  }

  let tabs = $derived([
    { id: 'roll', icon: '🍽️', label: t('tab.plan') },
    { id: 'recipes', icon: '📖', label: t('tab.recipes') },
    { id: 'cal', icon: '📅', label: t('tab.calendar') },
    { id: 'shop', icon: '🛒', label: t('tab.shopping') },
    ...(user?.is_admin ? [{ id: 'admin', icon: '👑', label: t('tab.admin') }] : []),
  ]);

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) setUser(await res.json());
    } finally {
      checking = false;
    }
  }

  // Every time we get the user from the server, follow their language and colors
  function setUser(u) {
    user = u;
    setLanguage(u.language);
    applyColors(u);
  }

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    page = 'roll';
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    user = null;
  }

  checkSession();
</script>

{#if checking}
  <div class="splash">🍽️</div>
{:else if !user}
  <Login onlogin={handleLogin} />
{:else}
  <header class="topbar">
    <button class="hello" onclick={openSettings} aria-label={t('app.settings')}>
      👋 {user.username} <span class="gear">⚙️</span>
    </button>
    <button class="logout" onclick={logout}>{t('app.logout')}</button>
  </header>

  <main>
    {#if page === 'settings'}
      <Settings {user} onsave={setUser} onback={() => (page = lastTab)} />
    {:else if page === 'roll'}
      <Planner />
    {:else if page === 'recipes'}
      <RecipeList />
    {:else if page === 'cal'}
      <Calendar />
    {:else if page === 'shop'}
      <Lists currentUser={user} />
    {:else if page === 'admin' && user.is_admin}
      <Admin currentUser={user} />
      <AdminHouseholds />
      <AdminCalendars />
    {/if}
  </main>

  <nav class="tabbar">
    {#each tabs as tab}
      <button class:active={page === tab.id} onclick={() => (page = tab.id)}>
        <span class="icon">{tab.icon}</span>
        <span>{tab.label}</span>
      </button>
    {/each}
  </nav>
{/if}

<style>
  .splash {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    50% { transform: scale(1.15); }
  }

  .topbar {
    max-width: 480px;
    margin: 0 auto;
    padding: 16px 16px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .hello {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .hello:hover {
    background: var(--tag);
    color: var(--text);
  }

  .gear { font-size: 0.8rem; }

  .logout {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 8px;
  }

  .logout:hover {
    background: var(--tag);
    color: var(--text);
  }

  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 20px 16px 120px;
  }

  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 4px;
    padding: 10px 8px calc(10px + env(safe-area-inset-bottom));
    background: var(--card);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  }

  .tabbar button {
    flex: 1;
    max-width: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tabbar button.active {
    color: var(--accent);
    background: var(--tag);
  }

  .icon { font-size: 1.4rem; }
</style>