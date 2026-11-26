// Calcule pure pentru foaia lunară (fără acces la baza de date), ca să poată fi testate.
import type { Distance, Refuel, Trip } from "./types";

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const tripKm = (t: Pick<Trip, "km_start" | "km_end">) => num(t.km_end) - num(t.km_start);

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
/** 0 = luni … 6 = duminică */
export const weekday = (d: string) => (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;
export function prevMonth(month: string): string {
  let [y, m] = month.split("-").map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
export const dateRo = (d: string | null | undefined) => (d ? d.split("-").reverse().join(".") : "");
const LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
export const monthName = (m: string) => `${LUNI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

// Sărbători legale cu dată fixă; cele mobile (Paște, Rusalii, Vinerea Mare) se debifează manual.
export const FIXED_HOLIDAYS = ["01-01", "01-02", "01-06", "01-07", "01-24", "05-01", "06-01", "08-15", "11-30", "12-01", "12-25", "12-26"];
export const defaultWorkDays = (month: string) => monthDays(month).filter((d) => weekday(d) < 5 && !FIXED_HOLIDAYS.includes(d.slice(5)));

export function distanceKm(list: Distance[], a: string | null, b: string | null): number | null {
  if (!a || !b || a === b) return 0;
  const d = list.find((x) => (x.loc_a === a && x.loc_b === b) || (x.loc_a === b && x.loc_b === a));
  return d ? num(d.km) : null;
}

export const sortTrips = <T extends Trip>(ts: T[]) =>
  [...ts].sort((a, b) => (a.trip_date + (a.time_start ?? "")).localeCompare(b.trip_date + (b.time_start ?? "")) || num(a.km_start) - num(b.km_start));

export interface MonthSummary {
  trips: Trip[]; refuels: Refuel[]; km: number; consumption: number; refueled: number; refuelValue: number;
  fuelStart: number; fuelEnd: number; kmStart: number; kmEnd: number; gaps: number[];
}

/**
 * Rezumatul unei luni pentru o mașină. `fuelStartFor(month)` întoarce stocul inițial salvat
 * pentru o lună (sau null), ca stocul să fie preluat din luna anterioară când lipsește.
 */
export function summarize(opts: {
  month: string; consumption: number; kmInitial: number; allTrips: Trip[]; allRefuels: Refuel[];
  fuelStartFor: (month: string) => number | null;
}): MonthSummary {
  const { month, consumption, kmInitial, allTrips, allRefuels, fuelStartFor } = opts;
  const inMonth = <T,>(xs: T[], key: (x: T) => string, m: string) => xs.filter((x) => key(x).startsWith(m));
  const fuelEndOf = (m: string, depth: number): number => {
    const ts = inMonth(allTrips, (t) => t.trip_date, m), rs = inMonth(allRefuels, (r) => r.refuel_date, m);
    const start = fuelStartOf(m, depth);
    return start + rs.reduce((s, r) => s + num(r.liters), 0) - (ts.reduce((s, t) => s + tripKm(t), 0) * consumption) / 100;
  };
  const fuelStartOf = (m: string, depth: number): number => {
    const saved = fuelStartFor(m);
    if (saved !== null && saved !== undefined) return num(saved);
    if (depth > 36) return 0;
    const p = prevMonth(m);
    const hasData = allTrips.some((t) => t.trip_date.startsWith(p)) || allRefuels.some((r) => r.refuel_date.startsWith(p)) || fuelStartFor(p) !== null;
    return hasData ? fuelEndOf(p, depth + 1) : 0;
  };

  const trips = sortTrips(inMonth(allTrips, (t) => t.trip_date, month));
  const refuels = inMonth(allRefuels, (r) => r.refuel_date, month).sort((a, b) => a.refuel_date.localeCompare(b.refuel_date));
  const km = trips.reduce((s, t) => s + tripKm(t), 0);
  const cons = (km * consumption) / 100;
  const refueled = refuels.reduce((s, r) => s + num(r.liters), 0);
  const fuelStart = fuelStartOf(month, 0);
  const before = allTrips.filter((t) => t.trip_date < month + "-01");
  const lastBefore = before.length ? Math.max(...before.map((t) => num(t.km_end))) : num(kmInitial);
  const gaps: number[] = [];
  trips.forEach((t, i) => { if (i > 0 && Math.abs(num(t.km_start) - num(trips[i - 1].km_end)) > 0.01) gaps.push(i); });
  return {
    trips, refuels, km, consumption: cons, refueled, refuelValue: refuels.reduce((s, r) => s + num(r.amount), 0),
    fuelStart, fuelEnd: fuelStart + refueled - cons,
    kmStart: trips.length ? num(trips[0].km_start) : lastBefore,
    kmEnd: trips.length ? num(trips[trips.length - 1].km_end) : lastBefore,
    gaps,
  };
}
