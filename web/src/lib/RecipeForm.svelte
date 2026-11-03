<script>
  import { TIME_LABELS, DIFFICULTY_LABELS } from './constants.js';

  // Props: what the parent component passes in
  let { recipe = null, onsaved = () => {}, oncancel = null } = $props();

  const isEdit = recipe !== null;

  let name = $state(recipe?.name ?? '');
  let timeRange = $state(recipe?.time_range ?? 3);
  let difficulty = $state(recipe?.difficulty ?? 1);
  let ingredients = $state(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({ amount: ing.amount ?? '', name: ing.name }))
      : [{ amount: '', name: '' }]
  );

  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  function addIngredient() {
    ingredients.push({ amount: '', name: '' });
  }

  function removeIngredient(index) {
    ingredients.splice(index, 1);
  }

  async function save(event) {
    event.preventDefault();
    error = '';
    message = '';

    if (!name.trim()) {
      error = 'Bitte einen Namen eingeben';
      return;
    }

    const cleaned = ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => ({ name: ing.name.trim(), amount: ing.amount.trim() || null }));

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
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');

      if (isEdit) {
        onsaved();
        return;
      }

      message = `„${name.trim()}" gespeichert! 🎉`;
      name = '';
      timeRange = 3;
      difficulty = 1;
      ingredients = [{ amount: '', name: '' }];
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <h1>{isEdit ? 'Rezept bearbeiten' : 'Neues Rezept'}</h1>

  <form onsubmit={save}>
    <div class="field">
      <label class="label" for="name">Name</label>
      <input id="name" type="text" bind:value={name} placeholder="z.B. Älplermagronen" />
    </div>

    <div class="field">
      <span class="label">Zeit</span>
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
      <span class="label">Aufwand</span>
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
      <p class="hint">{DIFFICULTY_LABELS[difficulty]}</p>
    </div>

    <div class="field">
      <span class="label">Zutaten</span>
      {#each ingredients as ing, i}
        <div class="ingredient-row">
          <input type="text" class="amount" bind:value={ing.amount} placeholder="500 g" />
          <input type="text" bind:value={ing.name} placeholder="Zutat" />
          <button
            type="button"
            class="remove"
            onclick={() => removeIngredient(i)}
            disabled={ingredients.length === 1}
            aria-label="Zutat entfernen"
          >
            ✕
          </button>
        </div>
      {/each}
      <button type="button" class="add" onclick={addIngredient}>+ Zutat hinzufügen</button>
    </div>

    <div class="actions">
      {#if oncancel}
        <button type="button" class="cancel" onclick={oncancel}>Abbrechen</button>
      {/if}
      <button type="submit" class="btn-primary save" disabled={saving}>
        {saving ? 'Speichere…' : 'Rezept speichern'}
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