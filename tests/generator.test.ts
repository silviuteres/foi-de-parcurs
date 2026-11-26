import { describe, expect, it } from "vitest";
import { defaultWorkDays } from "@/lib/calc";
import { generateTrips } from "@/lib/generator";
import type { Distance, Location } from "@/lib/types";

const loc = (id: string, name: string, is_hq = false): Location => ({ id, company_id: "c", name, city: "Cluj-Napoca", default_purpose: null, is_hq });
const locations = [loc("S", "Sediu", true), loc("A", "Primăria A"), loc("B", "Primăria B")];
const distances: Distance[] = [{ id: "1", company_id: "c", loc_a: "S", loc_b: "A", km: 12 }, { id: "2", company_id: "c", loc_a: "S", loc_b: "B", km: 31 }];

function seeded(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

describe("generator", () => {
  for (const seed of [1, 7, 42, 999]) {
    it(`acoperă exact km și păstrează kilometrajul continuu (seed ${seed})`, () => {
      const r = generateTrips({ vehicleId: "v", driverId: null, kmStart: 100000, kmEnd: 101500, days: defaultWorkDays("2026-11"), baseId: "S", destIds: ["A", "B"],
        maxPerDay: 2, fillLocal: true, startTime: "08:00", locations, distances, random: seeded(seed) });
      expect(r.trips[0].km_start).toBe(100000);
      expect(r.trips.at(-1)!.km_end).toBe(101500);
      r.trips.forEach((t, i) => { if (i) expect(t.km_start).toBeCloseTo(r.trips[i - 1].km_end, 1); expect(t.km_end).toBeGreaterThanOrEqual(t.km_start); });
      expect(new Set(r.trips.map((t) => t.trip_date)).size).toBeGreaterThan(10);
    });
  }
  it("refuză km de sfârșit mai mici", () => {
    expect(() => generateTrips({ vehicleId: "v", driverId: null, kmStart: 10, kmEnd: 5, days: ["2026-11-02"], baseId: "S", destIds: ["A"], maxPerDay: 1, fillLocal: false, startTime: "08:00", locations, distances })).toThrow();
  });
});
