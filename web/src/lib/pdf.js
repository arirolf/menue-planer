import { jsPDF } from 'jspdf';
import { months, weekdaysLong, toISO, addDays, startOfWeek, weekdayIndex } from './dates.js';
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

function drawDay(doc, entry, dayNumber, x, y, w, h) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(dayNumber), x + 1.8, y + 4.5);
  if (!entry) return;

  let cursor = y + 8.5;
  const maxY = y + h - 1.5;
  const textW = w - 3.6;

  // Writes text with line wrapping, returns false when the cell is full
  function write(text, style, size = 7.5) {
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
    const meal = entry[slot];
    if (!meal) continue;
    rows.push([`${letter}: ${clean(meal.title) || '–'}`, 'bold']);
    if (meal.note) rows.push([`» ${clean(meal.note)}`, 'italic', 6.8]);
  }
  for (const trip of entry.trips) {
    rows.push([[t('pdf.tripLetter'), trip.time, clean(trip.list_name)].filter(Boolean).join(' '), 'normal']);
    if (trip.note) rows.push([`» ${clean(trip.note)}`, 'italic', 6.8]);
  }

  for (const [text, style, size] of rows) {
    if (!write(text, style, size)) {
      doc.setFont('helvetica', 'bold');
      doc.text('…', x + w - 3, y + h - 1.5);
      break;
    }
  }
}

export function createMonthPdf({ calendarName, year, month, meals, trips }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Group entries by date
  const days = {};
  const dayOf = (iso) => (days[iso] ??= { lunch: null, dinner: null, trips: [] });
  for (const m of meals) dayOf(m.date)[m.slot] = m;
  for (const t of trips) dayOf(t.date).trips.push(t);

  // ----- Title -----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(t('pdf.title', { month: months()[month], year }), MARGIN, MARGIN + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(clean(calendarName), PAGE_W - MARGIN, MARGIN + 7, { align: 'right' });

  // ----- Grid layout -----
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((weekdayIndex(first) + daysInMonth) / 7);
  const gridStart = startOfWeek(first);

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

      if (date.getMonth() !== month) {
        doc.setFillColor(240, 240, 240);
        doc.rect(x, y, colW, rowH, 'FD');
        continue;
      }

      doc.rect(x, y, colW, rowH);
      drawDay(doc, days[toISO(date)], date.getDate(), x, y, colW, rowH);
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

  doc.save(`${t('pdf.filename')}-${year}-${String(month + 1).padStart(2, '0')}.pdf`);
}