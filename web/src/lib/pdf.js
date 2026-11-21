import { jsPDF } from 'jspdf';
import { months, weekdaysLong, toISO, addDays, startOfWeek, weekdayIndex, weekNumber, dayMonth } from './dates.js';
import { t, locale } from './i18n.svelte.js';

const PAGE_W = 297; // A4 landscape, in mm
const PAGE_H = 210;
const MARGIN = 10;

// Built-in PDF fonts only know Western European characters, so no emoji
function clean(text) {
  return (text ?? '')
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u201E\u201C\u201D\u2018\u2019\u2026\u20AC]/g, '')
    .trim();
}

// Notes hold one row per line
function noteLines(note) {
  return (note ?? '').split('\n').map(clean).filter(Boolean);
}

// zoom > 1 makes text bigger when there are only a few tall rows (week export)
function drawDay(doc, entry, dayLabel, x, y, w, h, zoom = 1) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10 * zoom);
  doc.text(clean(String(dayLabel)), x + 1.8, y + 4.5 * zoom);
  if (!entry) return;

  let cursor = y + 8.5 * zoom;
  const maxY = y + h - 1.5;
  const textW = w - 3.6;

  // Writes text with line wrapping, returns false when the cell is full
  function write(text, style, size = 7.5) {
    size *= zoom;
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, textW)) {
      if (cursor > maxY) return false;
      doc.text(line, x + 1.8, cursor);
      cursor += size * 0.42;
    }
    return true;
  }

  const rows = [];
  for (const [slot, letter] of [['lunch', t('pdf.lunchLetter')], ['dinner', t('pdf.dinnerLetter')]]) {
    for (const meal of entry[slot]) {
      rows.push([`${letter}: ${clean(meal.title) || '–'}`, 'bold']);
      for (const line of noteLines(meal.note)) rows.push([`» ${line}`, 'italic', 6.8]);
    }
  }
  for (const trip of entry.trips) {
    rows.push([[t('pdf.tripLetter'), trip.time, clean(trip.list_name)].filter(Boolean).join(' '), 'normal']);
    for (const line of noteLines(trip.note)) rows.push([`» ${line}`, 'italic', 6.8]);
  }

  for (const [text, style, size] of rows) {
    if (!write(text, style, size)) {
      doc.setFont('helvetica', 'bold');
      doc.text('…', x + w - 3, y + h - 1.5);
      break;
    }
  }
}

// Draws a grid of whole weeks (Mon–Sun) and saves it as a PDF
function createPdf({ calendarName, title, filename, gridStart, weeks, inRange, dayLabel, zoom, meals, trips }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Group entries by date
  const days = {};
  const dayOf = (iso) => (days[iso] ??= { lunch: [], dinner: [], trips: [] });
  for (const m of meals) dayOf(m.date)[m.slot].push(m); // already sorted by position
  for (const t of trips) dayOf(t.date).trips.push(t);

  // ----- Title -----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(clean(title), MARGIN, MARGIN + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(clean(calendarName), PAGE_W - MARGIN, MARGIN + 7, { align: 'right' });

  // ----- Grid layout -----
  const top = MARGIN + 13;
  const headerH = 7;
  const footerH = 7;
  const colW = (PAGE_W - 2 * MARGIN) / 7;
  const rowH = (PAGE_H - top - headerH - MARGIN - footerH) / weeks;

  doc.setLineWidth(0.3);
  doc.setDrawColor(0);

  // Weekday header (light grey prints fine in black and white)
  doc.setFillColor(225, 225, 225);
  doc.rect(MARGIN, top, colW * 7, headerH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  weekdaysLong().forEach((name, i) => {
    doc.text(name, MARGIN + i * colW + colW / 2, top + 4.8, { align: 'center' });
    if (i > 0) doc.line(MARGIN + i * colW, top, MARGIN + i * colW, top + headerH);
  });

  // ----- Day cells -----
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      const x = MARGIN + d * colW;
      const y = top + headerH + w * rowH;

      if (!inRange(date)) {
        doc.setFillColor(240, 240, 240);
        doc.rect(x, y, colW, rowH, 'FD');
        continue;
      }

      doc.rect(x, y, colW, rowH);
      drawDay(doc, days[toISO(date)], dayLabel(date), x, y, colW, rowH, zoom);
    }
  }

  // ----- Footer -----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(t('pdf.legend'), MARGIN, PAGE_H - MARGIN - 1);
  doc.text(
    t('pdf.created', { date: new Date().toLocaleDateString(locale()) }),
    PAGE_W - MARGIN,
    PAGE_H - MARGIN - 1,
    { align: 'right' }
  );

  doc.save(`${t('pdf.filename')}-${filename}.pdf`);
}

export function createMonthPdf({ calendarName, year, month, meals, trips }) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  createPdf({
    calendarName,
    meals,
    trips,
    title: t('pdf.title', { month: months()[month], year }),
    filename: `${year}-${String(month + 1).padStart(2, '0')}`,
    gridStart: startOfWeek(first),
    weeks: Math.ceil((weekdayIndex(first) + daysInMonth) / 7),
    inRange: (date) => date.getMonth() === month,
    dayLabel: (date) => date.getDate(),
    zoom: 1,
  });
}

// One or two weeks starting at the Monday of `start`
export function createWeeksPdf({ calendarName, start, weeks, meals, trips }) {
  const monday = startOfWeek(start);
  const sunday = addDays(monday, weeks * 7 - 1);
  const first = weekNumber(monday);
  const last = weekNumber(addDays(monday, (weeks - 1) * 7));
  createPdf({
    calendarName,
    meals,
    trips,
    title: t('pdf.titleWeeks', {
      weeks: first === last ? first : `${first}–${last}`,
      from: dayMonth(monday, true),
      to: `${dayMonth(sunday, true)} ${sunday.getFullYear()}`,
    }),
    filename: `${monday.getFullYear()}-${t('date.weekShort')}${first}`.replace(/\s/g, ''),
    gridStart: monday,
    weeks,
    inRange: () => true,
    dayLabel: (date) => dayMonth(date, true),
    zoom: weeks === 1 ? 1.5 : 1.3,
  });
}
