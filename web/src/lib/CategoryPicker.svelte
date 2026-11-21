<script>
  import { t } from './i18n.svelte.js';
  import { categoryName, categoryOrder } from './categories.js';

  // shop: { categories, stores } from /api/shop; value: category id or null (bindable)
  let { shop, value = $bindable(null) } = $props();

  let byId = $derived(new Map(shop.categories.map((c) => [c.id, c])));
  let order = $derived(categoryOrder(shop, null).map((id) => byId.get(id)).filter(Boolean));
</script>

{#if order.length}
  <div class="category-picker">
    <span class="label">{t('basics.category')}</span>
    <div class="chips">
      {#each order as c (c.id)}
        <button
          type="button"
          class="chip"
          class:active={value === c.id}
          onclick={() => (value = value === c.id ? null : c.id)}
        >
          {c.emoji ?? ''} {categoryName(c)}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .category-picker .label { display: block; margin: 4px 0 6px; }
  .chips { gap: 6px; }
  .chip { min-height: 44px; padding: 6px 14px; font-size: 0.9rem; }
</style>
