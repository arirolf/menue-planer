<script>
  import Randomizer from './lib/Randomizer.svelte';
  import RecipeList from './lib/RecipeList.svelte';
  import RecipeForm from './lib/RecipeForm.svelte';

  const tabs = [
    { id: 'roll', icon: '🎲', label: 'Würfeln' },
    { id: 'list', icon: '📖', label: 'Rezepte' },
    { id: 'add', icon: '➕', label: 'Neu' },
  ];

  let page = $state('roll');
</script>

<main>
  {#if page === 'roll'}
    <Randomizer />
  {:else if page === 'list'}
    <RecipeList />
  {:else if page === 'add'}
    <RecipeForm />
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

<style>
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 40px 16px 120px;
  }

  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    background: var(--card);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  }

  .tabbar button {
    flex: 1;
    max-width: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .tabbar button.active {
    color: var(--accent);
    background: var(--tag);
  }

  .icon { font-size: 1.4rem; }
</style>