import { t } from './i18n.svelte.js';

// Default categories have a key and no name until someone renames them.
// Call in markup or $derived so it follows the language.
export function categoryName(category) {
  return category.name ?? t(`cat.${category.key}`);
}

// Category ids in the order of the picked store, or the default order
export function categoryOrder(shop, storeId) {
  const store = shop.stores.find((s) => s.id === storeId);
  return store ? store.order : shop.categories.map((c) => c.id);
}
