/**
 * Today's date (YYYY-MM-DD) in India Standard Time. The server runs in UTC, so a plain
 * `toISOString()` gives yesterday's date between midnight and 05:30 IST.
 */
export const todayIst = (now: Date = new Date()) =>
  new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
