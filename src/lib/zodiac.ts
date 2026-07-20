/**
 * Western (tropical) zodiac sign from a birth month + day. Pure and offline —
 * used to show a playful sign badge next to a saved birthday. Ranges follow the
 * common Sun-sign date boundaries.
 */
export interface Zodiac {
  name: string;
  symbol: string;
}

// Each entry is the LAST date (inclusive) that its sign covers, walked in
// calendar order. Capricorn appears twice because it wraps the year end
// (Dec 22 – Jan 19).
const SIGNS: { name: string; symbol: string; untilMonth: number; untilDay: number }[] = [
  { name: 'Capricorn', symbol: '♑', untilMonth: 1, untilDay: 19 },
  { name: 'Aquarius', symbol: '♒', untilMonth: 2, untilDay: 18 },
  { name: 'Pisces', symbol: '♓', untilMonth: 3, untilDay: 20 },
  { name: 'Aries', symbol: '♈', untilMonth: 4, untilDay: 19 },
  { name: 'Taurus', symbol: '♉', untilMonth: 5, untilDay: 20 },
  { name: 'Gemini', symbol: '♊', untilMonth: 6, untilDay: 20 },
  { name: 'Cancer', symbol: '♋', untilMonth: 7, untilDay: 22 },
  { name: 'Leo', symbol: '♌', untilMonth: 8, untilDay: 22 },
  { name: 'Virgo', symbol: '♍', untilMonth: 9, untilDay: 22 },
  { name: 'Libra', symbol: '♎', untilMonth: 10, untilDay: 22 },
  { name: 'Scorpio', symbol: '♏', untilMonth: 11, untilDay: 21 },
  { name: 'Sagittarius', symbol: '♐', untilMonth: 12, untilDay: 21 },
  { name: 'Capricorn', symbol: '♑', untilMonth: 12, untilDay: 31 },
];

/** Returns the sign for a 1-based month + day, or null if the date is invalid. */
export function zodiacFor(month: number, day: number): Zodiac | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  for (const s of SIGNS) {
    if (month < s.untilMonth || (month === s.untilMonth && day <= s.untilDay)) {
      return { name: s.name, symbol: s.symbol };
    }
  }
  return null;
}

/** Parse a stored 'YYYY-MM-DD' birth date into numeric parts (null if absent/bad). */
export function parseBirthDate(
  iso: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!zodiacFor(month, day)) return null;
  return { year, month, day };
}

/** Build a stored 'YYYY-MM-DD' string from parts, or null if the date is invalid. */
export function toBirthDate(year: number, month: number, day: number): string | null {
  if (!zodiacFor(month, day)) return null;
  const now = new Date();
  const currentYear = now.getFullYear();
  // Basic sanity: a plausible birth year (covers everyone alive) and not future.
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return null;
  // Reject impossible days for the month (e.g. Feb 30).
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}
