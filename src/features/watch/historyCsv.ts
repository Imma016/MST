export type HistoryRow = {
  id: number;
  title: string;
  watchedAt: string | null;
  favorite: boolean;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function parseDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const first = Number(us[1]); const second = Number(us[2]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${us[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function parseHistoryCsv(text: string): { rows: HistoryRow[]; error?: string } {
  const table = parseCsv(text.replace(/^\uFEFF/, ''));
  if (table.length < 2) return { rows: [], error: 'The file needs a header row and at least one title.' };
  const headers = table[0].map(normalise);
  const titleIndex = headers.findIndex((header) => ['title', 'name', 'program', 'content', 'movietitle', 'showtitle'].includes(header));
  if (titleIndex < 0) return { rows: [], error: 'I could not find a title column. Use a column named Title, Name, or Program.' };
  const dateIndex = headers.findIndex((header) => ['date', 'datewatched', 'watchedat', 'viewed', 'viewedon', 'watchdate'].includes(header));
  const favoriteIndex = headers.findIndex((header) => ['favorite', 'favourite', 'isfavorite', 'liked', 'thumbsup'].includes(header));
  const rows = table.slice(1).map((values, id) => ({
    id,
    title: (values[titleIndex] ?? '').trim(),
    watchedAt: dateIndex >= 0 ? parseDate(values[dateIndex] ?? '') : null,
    favorite: favoriteIndex >= 0 && /^(1|true|yes|y|liked|thumbs ?up)$/i.test(values[favoriteIndex] ?? ''),
  })).filter((row) => row.title).slice(0, 300);
  if (!rows.length) return { rows: [], error: 'No titles were found in this file.' };
  return { rows };
}
