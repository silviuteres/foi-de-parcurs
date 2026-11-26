// Generatorul propune curse dus-întors care acoperă km de la bord dintre început și sfârșit de lună.
// Fiecare cursă propusă trebuie verificată de utilizator: trebuie să corespundă unei deplasări reale.
import { distanceKm, round1 } from "./calc";
import type { Distance, Location, Trip } from "./types";

export interface GenOptions {
  vehicleId: string; driverId: string | null; kmStart: number; kmEnd: number; days: string[];
  baseId: string; destIds: string[]; maxPerDay: number; fillLocal: boolean; startTime: string;
  locations: Location[]; distances: Distance[];
  random?: () => number;
}
export interface GenResult { trips: Trip[]; total: number; leftover: number }

const hm = (m: number) => { const r = Math.round(m); return `${String(Math.floor(r / 60) % 24).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`; };

export function generateTrips(o: GenOptions): GenResult {
  const rnd = o.random ?? Math.random;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const T = o.kmEnd - o.kmStart;
  if (!(T > 0)) throw new Error("Km la sfârșit trebuie să fie mai mari decât km la început.");
  const days = [...o.days].sort();
  if (!days.length) throw new Error("Selectați cel puțin o zi.");
  const routes = o.destIds.map((id) => ({ id, km: 2 * (distanceKm(o.distances, o.baseId, id) ?? 0) })).filter((r) => r.km > 0);
  if (!routes.length && !o.fillLocal) throw new Error("Bifați cel puțin o destinație cu distanță cunoscută.");

  type Slot = { to: string | null; km: number; local: boolean };
  const load: Record<string, Slot[]> = Object.fromEntries(days.map((d) => [d, []]));
  let rem = T;
  const minR = routes.length ? Math.min(...routes.map((r) => r.km)) : Infinity;
  const maxR = routes.length ? Math.max(...routes.map((r) => r.km)) : 0;
  for (let guard = 0; rem >= minR && guard < 5000; guard++) {
    const free = days.filter((d) => load[d].length < o.maxPerDay);
    if (!free.length) break;
    const minLoad = Math.min(...free.map((d) => load[d].length));
    const cand = free.filter((d) => load[d].length === minLoad);
    const day = cand[Math.floor(rnd() * cand.length)];
    const fit = routes.filter((r) => r.km <= rem);
    if (!fit.length) break;
    // spre final alege ruta cea mai lungă care încape, ca restul să fie cât mai mic
    const pick = rem < maxR * 1.5 ? fit.reduce((a, b) => (b.km > a.km ? b : a)) : fit[Math.floor(rnd() * fit.length)];
    load[day].push({ to: pick.id, km: pick.km, local: false });
    rem -= pick.km;
  }
  if (rem > 0.5 && o.fillLocal) {
    const parts = Math.max(1, Math.ceil(rem / 25));
    const per = rem / parts;
    const order = [...days].sort((a, b) => load[a].length - load[b].length);
    for (let i = 0; i < parts; i++) {
      const k = i === parts - 1 ? rem - per * (parts - 1) : per;
      load[order[i % order.length]].push({ to: null, km: round1(k), local: true });
    }
    rem = 0;
  }

  const base = o.locations.find((l) => l.id === o.baseId);
  const localName = `Deplasări locale ${base?.city || base?.name || ""}`.trim();
  const st = Number(o.startTime.slice(0, 2)) * 60 + Number(o.startTime.slice(3, 5));
  const trips: Trip[] = [];
  let odo = o.kmStart;
  for (const d of days) {
    let t = st + between(0, 40);
    for (const s of load[d]) {
      const dur = (s.km / 45) * 60 + between(30, 90);
      const loc = s.to ? o.locations.find((l) => l.id === s.to) : undefined;
      const km = round1(s.km);
      trips.push({
        vehicle_id: o.vehicleId, driver_id: o.driverId, trip_date: d, time_start: hm(t), time_end: hm(t + dur),
        from_loc: o.baseId, to_loc: s.to, round_trip: !s.local, route_text: s.local ? localName : null,
        purpose: s.local ? "deplasări locale în interes de serviciu" : loc?.default_purpose || "deplasare în interes de serviciu",
        km_start: round1(odo), km_end: round1(odo + km), generated: true,
      });
      odo += km;
      t += dur + between(15, 45);
    }
  }
  if (o.fillLocal && trips.length) trips[trips.length - 1].km_end = o.kmEnd;
  const total = trips.reduce((s, x) => s + (x.km_end - x.km_start), 0);
  return { trips, total, leftover: o.fillLocal ? 0 : Math.max(0, round1(rem)) };
}
