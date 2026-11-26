import { describe, expect, it } from "vitest";
import { defaultWorkDays, distanceKm, prevMonth, summarize } from "@/lib/calc";
import type { Distance, Refuel, Trip } from "@/lib/types";

const trip = (d: string, a: number, b: number): Trip => ({ vehicle_id: "v", driver_id: null, trip_date: d, time_start: "08:00", time_end: null, from_loc: null, to_loc: null, round_trip: true, route_text: null, purpose: null, km_start: a, km_end: b, generated: false });
const refuel = (d: string, l: number): Refuel => ({ id: d, company_id: "c", vehicle_id: "v", refuel_date: d, liters: l, amount: null, doc_no: null });

describe("calc", () => {
  it("luna anterioară trece peste an", () => { expect(prevMonth("2026-01")).toBe("2025-12"); });
  it("zilele lucrătoare exclud weekendul și sărbătorile fixe", () => {
    const d = defaultWorkDays("2026-12");
    expect(d).not.toContain("2026-12-01"); // 1 Decembrie
    expect(d).not.toContain("2026-12-05"); // sâmbătă
    expect(d).toContain("2026-12-02");
  });
  it("distanța este simetrică", () => {
    const ds: Distance[] = [{ id: "1", company_id: "c", loc_a: "A", loc_b: "B", km: 12 }];
    expect(distanceKm(ds, "B", "A")).toBe(12);
    expect(distanceKm(ds, "A", "C")).toBeNull();
  });
  it("stocul se preia din luna anterioară și semnalează km discontinui", () => {
    const trips = [trip("2026-10-05", 1000, 1100), trip("2026-11-03", 1100, 1200), trip("2026-11-04", 1210, 1300)];
    const refuels = [refuel("2026-10-01", 30), refuel("2026-11-02", 10)];
    const s = summarize({ month: "2026-11", consumption: 10, kmInitial: 1000, allTrips: trips, allRefuels: refuels,
      fuelStartFor: (m) => (m === "2026-10" ? 5 : null) });
    // octombrie: 5 + 30 − 10 = 25; noiembrie: 25 + 10 − 19 = 16
    expect(s.fuelStart).toBeCloseTo(25);
    expect(s.km).toBe(190);
    expect(s.fuelEnd).toBeCloseTo(16);
    expect(s.gaps).toEqual([1]);
    expect(s.kmStart).toBe(1100);
  });
});
