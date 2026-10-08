// functions/api/_shared/week.ts
// Bucketing minggu Senin 00:00 UTC (= Senin 07:00 WIB, yang ditulis di label).
// createdAt API sudah UTC — tidak perlu konversi zona waktu.

export function mondayOf(input: string | Date): string {
  const d = new Date(input);
  const day = d.getUTCDay(); // 0=Min, 1=Sen, ...
  const diff = (day + 6) % 7; // hari mundur ke Senin
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function currentMonday(): string {
  return mondayOf(new Date());
}

export function weekRangeUTC(weekStart: string): { start: Date; end: Date } {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Label WIB: Senin 00:00 UTC -> "Senin, 5 Okt 07:00".
export function fmtWIB(utcIso: string): string {
  const d = new Date(utcIso);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][wib.getUTCDay()];
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${dayName}, ${wib.getUTCDate()} ${MONTH_ID[wib.getUTCMonth()]} ${hh}:${mm}`;
}

export function weekLabel(weekStart: string): string {
  const { start, end } = weekRangeUTC(weekStart);
  return `${fmtWIB(start.toISOString())} – ${fmtWIB(end.toISOString())} WIB`;
}

export function isValidWeekStart(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return mondayOf(`${v}T00:00:00.000Z`) === v;
}

export { DAY_ID };
