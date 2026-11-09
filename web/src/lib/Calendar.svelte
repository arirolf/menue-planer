<script>
  import MealEditor from './MealEditor.svelte';
  import TripEditor from './TripEditor.svelte';
  import {
    WEEKDAYS,
    WEEKDAYS_LONG,
    MONTHS,
    SLOT_LABELS,
    toISO,
    fromISO,
    addDays,
    startOfWeek,
    weekdayIndex,
    todayISO,
    weekNumber,
  } from './dates.js';

  const SLOTS = ['lunch', 'dinner'];
  const EMPTY_DAY = { lunch: null, dinner: null, trips: [] };
  const today = todayISO();

  let calendars = $state([]);
  let calendarId = $state(null);
  let recipes = $state([]);
  let lists = $state([]);
  let loadingSetup = $state(true);

  let view = $state('week');
  let anchor = $state(new Date());
  let selectedDay = $state(today);

  let meals = $state([]);
  let trips = $state([]);
  let error = $state('');

  let editing = $state(null);

  let targetListId = $state(null);
  let listMessage = $state('');
  let pdfBusy = $state(false);

  let requestId = 0;

  // ---------- Which days are visible ----------

  let weekStart = $derived(startOfWeek(anchor));
  let weekDays = $derived(Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i))));

  let monthFirst = $derived(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  let monthCells = $derived.by(() => {
    const start = startOfWeek(monthFirst);
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i);
      return { iso: toISO(d), inMonth: d.getMonth() === monthFirst.getMonth() };
    });
  });

  let range = $derived(
    view === 'week'
      ? { from: weekDays[0], to: weekDays[6] }
      : { from: monthCells[0].iso, to: monthCells[41].iso }
  );

  let listRange = $derived(
    view === 'week'
      ? { from: weekDays[0], to: weekDays[6], label: 'dieser Woche' }
      : {
          from: toISO(monthFirst),
          to: toISO(new Date(monthFirst.getFullYear(), monthFirst.getMonth() + 1, 0)),
          label: 'dieses Monats',
        }
  );

  let selectedVisible = $derived(selectedDay >= range.from && selectedDay <= range.to);

  let title = $derived.by(() => {
    if (view === 'month') return `${MONTHS[monthFirst.getMonth()]} ${monthFirst.getFullYear()}`;
    const end = addDays(weekStart, 6);
    return `KW ${weekNumber(weekStart)} · ${weekStart.getDate()}. – ${end.getDate()}. ${MONTHS[end.getMonth()].slice(0, 3)}`;
  });

  // Group meals and trips by date
  let byDate = $derived.by(() => {
    const map = {};
    const dayOf = (iso) => (map[iso] ??= { lunch: null, dinner: null, trips: [] });
    for (const m of meals) dayOf(m.date)[m.slot] = m;
    for (const t of trips) dayOf(t.date).trips.push(t);
    return map;
  });

  function day(iso) {
    return byDate[iso] ?? EMPTY_DAY;
  }

  // ---------- Loading ----------

  async function setup() {
    try {
      const [cRes, rRes, lRes] = await Promise.all([
        fetch('/api/calendars'),
        fetch('/api/recipes'),
        fetch('/api/lists'),
      ]);
      if (!cRes.ok) throw new Error('Kalender konnten nicht geladen werden');
      calendars = await cRes.json();
      calendarId = calendars[0]?.id ?? null;
      if (rRes.ok) recipes = await rRes.json();
      if (lRes.ok) {
        lists = await lRes.json();
        targetListId = lists[0]?.id ?? null;
      }
    } catch (e) {
      error = e.message;
    } finally {
      loadingSetup = false;
    }
  }

  async function loadEntries(id, from, to) {
    const thisRequest = ++requestId;
    try {
      const res = await fetch(`/api/calendars/${id}/entries?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('Einträge konnten nicht geladen werden');
      const data = await res.json();
      if (thisRequest !== requestId) return; // an older answer arrived late, ignore it
      meals = data.meals;
      trips = data.trips;
      error = '';
    } catch (e) {
      if (thisRequest === requestId) error = e.message;
    }
  }

  function reload() {
    if (calendarId) loadEntries(calendarId, range.from, range.to);
  }

  $effect(() => {
    reload();
  });

  // ---------- Navigation ----------

  function move(step) {
    listMessage = '';
    if (view === 'week') {
      anchor = addDays(anchor, step * 7);
      selectedDay = toISO(addDays(fromISO(selectedDay), step * 7));
    } else {
      anchor = new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
    }
  }

  function goToday() {
    listMessage = '';
    anchor = new Date();
    selectedDay = today;
  }

  function setView(newView) {
    if (newView === view) return;
    listMessage = '';
    // keep the selected day, so switching views stays in the same place
    if (!selectedVisible) selectedDay = toISO(view === 'month' ? monthFirst : weekStart);
    anchor = fromISO(selectedDay);
    view = newView;
  }

  // ---------- Editors ----------

  function openMeal(date, slot, meal) {
    editing = { type: 'meal', date, slot, meal };
  }

  function openTrip(date, trip) {
    editing = { type: 'trip', date, trip };
  }

  function closeEditor() {
    editing = null;
  }

  function afterSave() {
    editing = null;
    reload();
  }

  // ---------- Ingredients onto a list ----------

  async function ingredientsToList() {
    listMessage = '';
    try {
      const res = await fetch(`/api/calendars/${calendarId}/to-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: targetListId, from: listRange.from, to: listRange.to }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = lists.find((l) => l.id === targetListId);
      listMessage =
        data.added > 0
          ? `✓ ${data.added} Zutaten auf „${list?.name}"`
          : 'Keine Rezepte mit Zutaten in diesem Zeitraum';
    } catch {
      listMessage = 'Hat nicht geklappt, nochmal versuchen';
    }
  }

  // ---------- PDF ----------

  async function downloadPdf() {
    pdfBusy = true;
    error = '';
    try {
      const year = monthFirst.getFullYear();
      const month = monthFirst.getMonth();
      const from = toISO(monthFirst);
      const to = toISO(new Date(year, month + 1, 0));

      const res = await fetch(`/api/calendars/${calendarId}/entries?from=${from}&to=${to}`);
      if (!res.ok) throw new Error('PDF-Daten konnten nicht geladen werden');
      const data = await res.json();

      // Only load the PDF library when someone actually needs it
      const { createMonthPdf } = await import('./pdf.js');
      createMonthPdf({
        calendarName: data.calendar.name,
        year,
        month,
        meals: data.meals,
        trips: data.trips,
      });
    } catch (e) {
      error = e.message || 'PDF konnte nicht erstellt werden';
    } finally {
      pdfBusy = false;
    }
  }

  setup();
</script>

{#snippet dayCell(iso, inMonth, weekdayLabel)}
  {@const entry = day(iso)}
  <button
    class="cell"
    class:other={!inMonth}
    class:today={iso === today}
    class:selected={iso === selectedDay}
    onclick={() => (selectedDay = iso)}
  >
    {#if weekdayLabel}<span class="cell-wd">{weekdayLabel}</span>{/if}
    <span class="cell-day">{fromISO(iso).getDate()}</span>
    <span class="dots">
      {#if entry.lunch}<span class="dot lunch"></span>{/if}
      {#if entry.dinner}<span class="dot dinner"></span>{/if}
      {#if entry.trips.length > 0}<span class="dot trip-dot"></span>{/if}
    </span>
  </button>
{/snippet}

{#snippet dayCard(iso)}
  {@const d = fromISO(iso)}
  {@const entry = day(iso)}
  <article class="day" class:today={iso === today}>
    <header class="day-head">
      <span class="day-name">{WEEKDAYS_LONG[weekdayIndex(d)]}</span>
      <span class="day-date">{d.getDate()}. {MONTHS[d.getMonth()]}</span>
    </header>

    {#each SLOTS as slot}
      {@const meal = entry[slot]}
      <button class="slot" class:empty={!meal} onclick={() => openMeal(iso, slot, meal)}>
        <span class="slot-label">{SLOT_LABELS[slot]}</span>
        {#if meal}
          <span class="slot-body">
            {#if meal.title}<span class="meal-title">{meal.title}</span>{/if}
            {#if meal.note}<span class="meal-note">💬 {meal.note}</span>{/if}
          </span>
        {:else}
          <span class="slot-add">+ planen</span>
        {/if}
      </button>
    {/each}

    {#each entry.trips as trip (trip.id)}
      <button class="trip" onclick={() => openTrip(iso, trip)}>
        <span>🛒 {trip.time ? `${trip.time} · ` : ''}Einkaufen{trip.list_name ? ` · ${trip.list_name}` : ''}</span>
        {#if trip.note}<span class="meal-note">💬 {trip.note}</span>{/if}
      </button>
    {/each}

    <button class="add-trip" onclick={() => openTrip(iso, null)}>+ Einkauf planen</button>
  </article>
{/snippet}

<div class="page">
  <h1>Kalender</h1>

  {#if loadingSetup}
    <p class="muted">Lade…</p>
  {:else if calendars.length === 0}
    <p class="muted">Noch kein Kalender für dich. Der Admin kann im 👑 Tab einen für deinen Haushalt erstellen.</p>
  {:else}
    {#if calendars.length > 1}
      <select class="cal-select" bind:value={calendarId}>
        {#each calendars as c (c.id)}
          <option value={c.id}>📅 {c.name}</option>
        {/each}
      </select>
    {/if}

    <div class="toolbar">
      <div class="switch">
        <button class:active={view === 'week'} onclick={() => setView('week')}>Woche</button>
        <button class:active={view === 'month'} onclick={() => setView('month')}>Monat</button>
      </div>
      <button class="today-btn" onclick={goToday}>Heute</button>
    </div>

    <div class="nav">
      <button class="nav-btn" onclick={() => move(-1)} aria-label="Zurück">‹</button>
      <span class="period">{title}</span>
      <button class="nav-btn" onclick={() => move(1)} aria-label="Weiter">›</button>
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    {#if view === 'week'}
      <div class="grid strip">
        {#each weekDays as iso, i (iso)}
          {@render dayCell(iso, true, WEEKDAYS[i])}
        {/each}
      </div>
    {:else}
      <div class="grid month">
        {#each WEEKDAYS as wd}
          <span class="wd">{wd}</span>
        {/each}
        {#each monthCells as cell (cell.iso)}
          {@render dayCell(cell.iso, cell.inMonth, null)}
        {/each}
      </div>
    {/if}

    <p class="legend">
      <span class="dot lunch"></span> Mittag
      <span class="dot dinner"></span> Abend
      <span class="dot trip-dot"></span> Einkauf
    </p>

    {#if selectedVisible}
      {@render dayCard(selectedDay)}
    {/if}

    {#if lists.length > 0}
      <section class="box">
        <span class="label">Zutaten {listRange.label}</span>
        <div class="row">
          <select bind:value={targetListId}>
            {#each lists as l (l.id)}
              <option value={l.id}>{l.household_id ? '🏠' : '📝'} {l.name}</option>
            {/each}
          </select>
          <button class="btn-primary small" onclick={ingredientsToList}>🛒 Hinzufügen</button>
        </div>
        {#if listMessage}<p class="success">{listMessage}</p>{/if}
      </section>
    {/if}

    <button class="pdf-btn" onclick={downloadPdf} disabled={pdfBusy}>
      {pdfBusy ? 'Erstelle PDF…' : `🖨️ ${MONTHS[monthFirst.getMonth()]} als PDF`}
    </button>
  {/if}
</div>

{#if editing?.type === 'meal'}
  <MealEditor
    {calendarId}
    date={editing.date}
    slot={editing.slot}
    meal={editing.meal}
    {recipes}
    onclose={closeEditor}
    onsaved={afterSave}
  />
{:else if editing?.type === 'trip'}
  <TripEditor
    {calendarId}
    date={editing.date}
    trip={editing.trip}
    {lists}
    onclose={closeEditor}
    onsaved={afterSave}
  />
{/if}

<style>
  h1 {
    font-size: 2rem;
    margin: 0 0 16px;
    text-align: center;
  }

  .muted {
    color: var(--muted);
    text-align: center;
  }

  .error { text-align: center; }

  .cal-select { margin-bottom: 12px; }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .switch {
    display: flex;
    background: var(--tag);
    border-radius: 999px;
    padding: 4px;
  }

  .switch button {
    border: none;
    background: none;
    color: var(--muted);
    font: inherit;
    padding: 8px 18px;
    border-radius: 999px;
    cursor: pointer;
  }

  .switch button.active {
    background: var(--card);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow);
  }

  .today-btn {
    border: 2px solid var(--tag);
    background: var(--card);
    color: var(--text);
    font: inherit;
    padding: 8px 16px;
    border-radius: 999px;
    cursor: pointer;
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .nav-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: var(--card);
    box-shadow: var(--shadow);
    color: var(--text);
    font-size: 1.6rem;
    line-height: 1;
    cursor: pointer;
  }

  .period { font-weight: 600; }

  /* ----- Shared grid for week strip and month ----- */

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    padding: 10px;
    background: var(--card);
    border-radius: 18px;
    box-shadow: var(--shadow);
  }

  .wd {
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
    padding: 4px 0;
  }

  .cell {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .strip .cell {
    aspect-ratio: auto;
    min-height: 76px;
  }

  .cell-wd {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .cell-day { font-size: 1.05rem; }

  .cell.other { opacity: 0.35; }

  .cell.today .cell-day {
    color: var(--accent);
    font-weight: 700;
  }

  .cell.selected { background: var(--tag); }

  .dots {
    display: flex;
    gap: 3px;
    min-height: 6px;
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot.lunch { background: #f2b134; }
  .dot.dinner { background: var(--accent); }
  .dot.trip-dot { background: var(--success); }

  .legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 10px 0 16px;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .legend .dot { margin-left: 8px; }

  /* ----- Day details ----- */

  .day {
    background: var(--card);
    border-radius: 18px;
    box-shadow: var(--shadow);
    padding: 14px;
  }

  .day.today { outline: 2px solid var(--accent); }

  .day-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }

  .day-name {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .day-date {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .slot {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 56px;
    padding: 12px 14px;
    margin-bottom: 8px;
    border: none;
    border-radius: 14px;
    background: var(--tag);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .slot.empty {
    background: none;
    border: 2px dashed var(--tag);
  }

  .slot-label {
    flex-shrink: 0;
    width: 56px;
    padding-top: 2px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .slot-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .meal-title { font-weight: 600; }

  .meal-note {
    font-size: 0.88rem;
    color: var(--muted);
  }

  .slot-add { color: var(--muted); }

  .trip {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    margin-bottom: 8px;
    border: none;
    border-radius: 14px;
    background: color-mix(in srgb, var(--success) 14%, var(--card));
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .add-trip {
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .add-trip:hover { background: var(--tag); }

  /* ----- Bottom actions ----- */

  .box {
    margin-top: 24px;
    padding: 16px;
    background: var(--card);
    border-radius: 18px;
    box-shadow: var(--shadow);
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .small {
    flex-shrink: 0;
    padding: 10px 16px;
    font-size: 1rem;
  }

  .box .success {
    margin: 10px 0 0;
    text-align: center;
  }

  .pdf-btn {
    width: 100%;
    margin-top: 16px;
    padding: 14px;
    border: 2px solid var(--text);
    border-radius: 999px;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .pdf-btn:hover:not(:disabled) {
    background: var(--text);
    color: var(--bg);
  }

  .pdf-btn:disabled { opacity: 0.5; cursor: wait; }
</style>