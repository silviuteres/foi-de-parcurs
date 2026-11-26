// Foaia de parcurs pentru tipărire (HTML) și export CSV pentru Excel.
import { dateRo, monthName, num, tripKm, type MonthSummary } from "./calc";
import type { Company, Driver, Location, Trip, Vehicle } from "./types";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const fmt = (n: number, d = 0) => Number(n || 0).toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function routeText(t: Trip, locations: Location[]): string {
  if (t.route_text) return t.route_text;
  const n = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const a = n(t.from_loc), b = n(t.to_loc);
  return t.round_trip ? `${a} – ${b} – ${a}` : `${a} – ${b}`;
}

interface Ctx { company: Company; vehicle: Vehicle; month: string; sum: MonthSummary; drivers: Driver[]; locations: Location[]; sheetNo: string | null; mainDriverId: string | null }

export function sheetHtml({ company, vehicle, month, sum, drivers, locations, sheetNo, mainDriverId }: Ctx): string {
  const dn = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? "";
  const rows = sum.trips.map((t, i) => `<tr><td>${i + 1}</td><td>${dateRo(t.trip_date)}</td><td>${esc(t.time_start?.slice(0, 5))}</td><td>${esc(t.time_end?.slice(0, 5))}</td><td>${esc(dn(t.driver_id))}</td><td>${esc(routeText(t, locations))}</td><td>${esc(t.purpose)}</td><td class="n">${fmt(t.km_start)}</td><td class="n">${fmt(t.km_end)}</td><td class="n">${fmt(tripKm(t))}</td><td></td></tr>`).join("");
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Foaie de parcurs ${esc(vehicle.plate)} ${esc(month)}</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#000}
h1{font-size:16px;text-align:center;margin:6px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:3px 4px;vertical-align:top}th{background:#eee}
.n{text-align:right;white-space:nowrap}.hdr{display:flex;justify-content:space-between;gap:20px}.sig{display:flex;justify-content:space-between;margin-top:28px}.sig div{width:30%;text-align:center;border-top:1px solid #000;padding-top:4px}
@media print{.noprint{display:none}}</style></head><body>
<p class="noprint"><button onclick="window.print()">Tipărește / salvează PDF</button></p>
<div class="hdr"><div><b>${esc(company.name)}</b><br>CUI: ${esc(company.cui)} · Reg. Com.: ${esc(company.reg_com)}<br>${esc(company.address)}</div><div style="text-align:right">Nr. foaie: <b>${esc(sheetNo)}</b><br>Perioada: ${esc(monthName(month))}</div></div>
<h1>FOAIE DE PARCURS</h1>
<p>Autovehicul: <b>${esc(vehicle.plate)}</b> ${esc(vehicle.make)} · Combustibil: ${esc(vehicle.fuel)} · Consum normat: ${fmt(num(vehicle.consumption), 1)} l/100 km · Șofer: ${esc(dn(mainDriverId ?? vehicle.default_driver_id))}</p>
<table><thead><tr><th>Nr.</th><th>Data</th><th>Ora plecare</th><th>Ora sosire</th><th>Șofer</th><th>Traseu</th><th>Scopul deplasării</th><th>Km plecare</th><th>Km sosire</th><th>Km parcurși</th><th>Semnătura</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="9"><b>Total km parcurși</b></td><td class="n"><b>${fmt(sum.km)}</b></td><td></td></tr></tfoot></table><br>
<table><tr><th>Stoc inițial (l)</th><th>Alimentat (l)</th><th>Consum normat (l)</th><th>Stoc final (l)</th><th>Valoare alimentări (lei)</th></tr>
<tr><td class="n">${fmt(sum.fuelStart, 2)}</td><td class="n">${fmt(sum.refueled, 2)}</td><td class="n">${fmt(sum.consumption, 2)}</td><td class="n">${fmt(sum.fuelEnd, 2)}</td><td class="n">${fmt(sum.refuelValue, 2)}</td></tr></table>
${sum.refuels.length ? `<p>Alimentări: ${sum.refuels.map((a) => `${dateRo(a.refuel_date)} – ${fmt(a.liters, 2)} l${a.doc_no ? " (bon " + esc(a.doc_no) + ")" : ""}`).join("; ")}</p>` : ""}
<div class="sig"><div>Șofer</div><div>Verificat (compartiment financiar)</div><div>Aprobat${company.approved_by ? "<br>" + esc(company.approved_by) : ""}</div></div>
</body></html>`;
}

export function sheetCsv({ sum, drivers, locations }: Pick<Ctx, "sum" | "drivers" | "locations">): string {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const dn = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? "";
  const lines = [["Nr", "Data", "Ora plecare", "Ora sosire", "Sofer", "Traseu", "Scop", "Km plecare", "Km sosire", "Km parcursi"].map(q).join(";")];
  sum.trips.forEach((t, i) => lines.push([i + 1, dateRo(t.trip_date), t.time_start?.slice(0, 5), t.time_end?.slice(0, 5), dn(t.driver_id), routeText(t, locations), t.purpose, fmt(t.km_start), fmt(t.km_end), fmt(tripKm(t))].map(q).join(";")));
  lines.push(["", "", "", "", "", "", "Total", "", "", fmt(sum.km)].map(q).join(";"));
  lines.push("");
  lines.push([q("Stoc initial l"), q(fmt(sum.fuelStart, 2)), q("Alimentat l"), q(fmt(sum.refueled, 2)), q("Consum normat l"), q(fmt(sum.consumption, 2)), q("Stoc final l"), q(fmt(sum.fuelEnd, 2))].join(";"));
  return "﻿" + lines.join("\r\n");
}
