<script>
  import { TIME_LABELS } from './constants.js';
  import { t, numberFormat } from './i18n.svelte.js';
  import { BASE_SERVINGS, PRESET_SERVINGS, suggestedAmount } from '../../../shared/scale.js';

  // Props: what the parent component passes in
  let { recipe = null, onsaved = () => {}, oncancel = null } = $props();

  const isEdit = recipe !== null;

  let name = $state(recipe?.name ?? '');
  let timeRange = $state(recipe?.time_range ?? 3);
  let difficulty = $state(recipe?.difficulty ?? 1);
  // amount = for 4 people. amount_6 / amount_8 are only filled when typed by hand,
  // otherwise they're calculated (shown greyed out as a suggestion).
  const emptyIngredient = () => ({ amount: '', name: '', amount_6: '', amount_8: '' });

  let ingredients = $state(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({
          amount: ing.amount ?? '',
          name: ing.name,
          amount_6: ing.amount_6 ?? '',
          amount_8: ing.amount_8 ?? '',
        }))
      : [emptyIngredient()]
  );

  // Open straight away if someone already typed amounts for 6 / 8
  let showPresets = $state(
    ingredients.some((ing) => PRESET_SERVINGS.some((n) => ing[`amount_${n}`]))
  );

  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  function addIngredient() {
    ingredients.push(emptyIngredient());
  }

  function removeIngredient(index) {
    ingredients.splice(index, 1);
  }

  async function save(event) {
    event.preventDefault();
    error = '';
    message = '';

    if (!name.trim()) {
      error = t('recipeForm.nameRequired');
      return;
    }

    const cleaned = ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => ({
        name: ing.name.trim(),
        amount: ing.amount.trim() || null,
        amount_6: ing.amount_6.trim() || null,
        amount_8: ing.amount_8.trim() || null,
      }));

    saving = true;
    try {
      const res = await fetch(isEdit ? `/api/recipes/${recipe.id}` : '/api/recipes', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          time_range: timeRange,
          difficulty,
          ingredients: cleaned,
        }),
      });
      if (!res.ok) throw new Error(t('common.saveFailed'));

      if (isEdit) {
        onsaved();
        return;
      }

      message = t('recipeForm.saved', { name: name.trim() });
      name = '';
      timeRange = 3;
      difficulty = 1;
      ingredients = [emptyIngredient()];
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <h1>{t(isEdit ? 'recipeForm.edit' : 'recipeForm.new')}</h1>

  <form onsubmit={save}>
    <div class="field">
      <label class="label" for="name">{t('common.name')}</label>
      <input id="name" type="text" bind:value={name} placeholder={t('recipeForm.namePlaceholder')} />
    </div>

    <div class="field">
      <span class="label">{t('common.time')}</span>
      <div class="chips">
        {#each TIME_LABELS.slice(1) as label, i}
          <button
            type="button"
            class="chip"
            class:active={timeRange === i + 1}
            onclick={() => (timeRange = i + 1)}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <span class="label">{t('common.effort')}</span>
      <div class="chips">
        {#each [1, 2, 3] as level}
          <button
            type="button"
            class="chip"
            class:active={difficulty === level}
            onclick={() => (difficulty = level)}
          >
            {'🔪'.repeat(level)}
          </button>
        {/each}
      </div>
      <p class="hint">{t('recipe.difficulty')[difficulty]}</p>
    </div>

    <div class="field">
      <span class="label">{t('servings.ingredientsFor', { n: BASE_SERVINGS })}</span>
      <button type="button" class="presets-toggle" onclick={() => (showPresets = !showPresets)}>
        {t('recipeForm.showPresets')} {showPresets ? '▲' : '▼'}
      </button>
      {#if showPresets}<p class="hint presets-hint">{t('recipeForm.presetsHint')}</p>{/if}

      {#each ingredients as ing, i}
        <div class="ingredient-row" class:grouped={showPresets}>
          <input type="text" class="amount" bind:value={ing.amount} placeholder={t('recipeForm.amountPlaceholder')} />
          <input type="text" bind:value={ing.name} placeholder={t('recipeForm.ingredientPlaceholder')} />
          <button
            type="button"
            class="remove"
            onclick={() => removeIngredient(i)}
            disabled={ingredients.length === 1}
            aria-label={t('recipeForm.removeIngredient')}
          >
            ✕
          </button>
        </div>
        {#if showPresets}
          <div class="preset-row">
            {#each PRESET_SERVINGS as n}
              {@const key = `amount_${n}`}
              <label class="preset">
                <span>{n} 👤</span>
                <input
                  type="text"
                  bind:value={ing[key]}
                  class:own={ing[key].trim()}
                  placeholder={suggestedAmount(ing.amount.trim(), n, numberFormat()) ?? ''}
                  aria-label={t('recipeForm.amountFor', { n })}
                />
              </label>
            {/each}
          </div>
        {/if}
      {/each}
      <button type="button" class="add" onclick={addIngredient}>{t('recipeForm.addIngredient')}</button>
    </div>

    <div class="actions">
      {#if oncancel}
        <button type="button" class="cancel" onclick={oncancel}>{t(isEdit ? 'common.cancel' : 'common.back')}</button>
      {/if}
      <button type="submit" class="btn-primary save" disabled={saving}>
        {saving ? t('common.saving') : t('recipeForm.save')}
      </button>
    </div>

    {#if error}<p class="error">{error}</p>{/if}
    {#if message}<p class="success">{message}</p>{/if}
  </form>
</div>

<style>
  h1 {
    font-size: 2rem;
    margin: 0 0 24px;
    text-align: center;
  }

  form {
    background: var(--card);
    padding: 24px;
    border-radius: 20px;
    box-shadow: var(--shadow);
  }

  .field { margin-bottom: 24px; }

  .hint {
    font-size: 0.9rem;
    color: var(--muted);
    margin: 8px 0 0;
  }

  .ingredient-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .ingredient-row .amount { width: 100px; flex-shrink: 0; }

  .presets-toggle {
    display: block;
    margin: -2px 0 10px;
    padding: 4px 0;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .presets-hint { margin: 0 0 12px; font-size: 0.85rem; }

  /* With 6/8 amounts shown, each ingredient becomes a little group */
  .ingredient-row.grouped { margin-bottom: 4px; }
  .preset-row {
    display: flex;
    gap: 8px;
    margin: 0 52px 14px 0;
  }
  .preset {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .preset input {
    padding: 8px 10px;
    font-size: 0.9rem;
  }
  .preset input::placeholder { color: var(--muted); opacity: 0.7; }
  .preset input.own { border-color: var(--accent); }

  .remove {
    flex-shrink: 0;
    width: 44px;
    border: none;
    border-radius: 12px;
    background: var(--tag);
    color: var(--muted);
    font-size: 1rem;
    cursor: pointer;
  }
  .remove:disabled { opacity: 0.3; cursor: default; }

  .add {
    border: 2px dashed var(--tag);
    background: none;
    color: var(--muted);
    width: 100%;
    padding: 10px;
    border-radius: 12px;
    font: inherit;
    cursor: pointer;
  }
  .add:hover { border-color: var(--accent); color: var(--accent); }

  .actions {
    display: flex;
    gap: 12px;
  }

  .save { flex: 1; }

  .cancel {
    padding: 14px 20px;
    border: 2px solid var(--tag);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  p.error, p.success { text-align: center; margin: 16px 0 0; }
</style>