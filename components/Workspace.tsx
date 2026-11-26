"use client";
// Spațiul de lucru al unei firme: banda de context (mașină + lună) și filele de lucru.
// Toate citirile și scrierile trec prin Supabase, cu regulile de acces din baza de date.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dateRo, defaultWorkDays, distanceKm, monthDays, monthName, num, round1, summarize, tripKm, weekday } from "@/lib/calc";
import { fmt, routeText, sheetCsv, sheetHtml } from "@/lib/export";
import { generateTrips, type GenResult } from "@/lib/generator";
import type { Company, CreditPackage, Distance, Driver, LedgerRow, Location, Refuel, Role, Sheet, Trip, Vehicle } from "@/lib/types";

type Tab = "foaie" | "gen" | "masini" | "soferi" | "locatii" | "firma" | "credite";
const TABS: { id: Tab; label: string; roles: Role[] }[] = [
  { id: "foaie", label: "Foaia lunară", roles: ["admin", "contabil", "sofer"] },
  { id: "gen", label: "Generator curse", roles: ["admin"] },
  { id: "masini", label: "Mașini", roles: ["admin", "contabil"] },
  { id: "soferi", label: "Șoferi", roles: ["admin", "contabil"] },
  { id: "locatii", label: "Locații și distanțe", roles: ["admin", "contabil", "sofer"] },
  { id: "firma", label: "Firmă", roles: ["admin", "contabil"] },
  { id: "credite", label: "Credite", roles: ["admin", "contabil"] },
];
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fd = (e: React.FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;

export default function Workspace({ companyId, role, email }: { companyId: string; role: Role; email: string }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const isAdmin = role === "admin";
  const canTrips = role === "admin" || role === "sofer";

  const [tab, setTab] = useState<Tab>("foaie");
  const [month, setMonth] = useState(currentMonth());
  const [vehId, setVehId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [distances, setDistances] = useState<Distance[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [paidMonths, setPaidMonths] = useState<{ vehicle_id: string; month: string }[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refuels, setRefuels] = useState<Refuel[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); }, []);

  const loadBase = useCallback(async () => {
    const [c, d, v, l, ds, p, lg, vm] = await Promise.all([
      sb.from("companies").select("*").eq("id", companyId).single(),
      sb.from("drivers").select("*").eq("company_id", companyId).order("name"),
      sb.from("vehicles").select("*").eq("company_id", companyId).order("plate"),
      sb.from("locations").select("*").eq("company_id", companyId).order("name"),
      sb.from("distances").select("*").eq("company_id", companyId),
      sb.from("credit_packages").select("*").eq("active", true).order("sort"),
      sb.from("credit_ledger").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
      sb.from("vehicle_months").select("vehicle_id, month").eq("company_id", companyId),
    ]);
    setCompany(c.data as Company); setDrivers((d.data ?? []) as Driver[]); setVehicles((v.data ?? []) as Vehicle[]);
    setLocations((l.data ?? []) as Location[]); setDistances((ds.data ?? []) as Distance[]); setPackages((p.data ?? []) as CreditPackage[]);
    setLedger((lg.data ?? []) as LedgerRow[]); setPaidMonths(vm.data ?? []);
    setLoading(false);
  }, [sb, companyId]);

  const loadVehicle = useCallback(async (id: string | null) => {
    if (!id) { setTrips([]); setRefuels([]); setSheets([]); return; }
    const [t, r, s] = await Promise.all([
      sb.from("trips").select("*").eq("vehicle_id", id).order("trip_date"),
      sb.from("refuels").select("*").eq("vehicle_id", id),
      sb.from("sheets").select("*").eq("vehicle_id", id),
    ]);
    setTrips((t.data ?? []) as Trip[]); setRefuels((r.data ?? []) as Refuel[]); setSheets((s.data ?? []) as Sheet[]);
  }, [sb]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => {
    if (!vehId && vehicles.length) setVehId(vehicles[0].id);
    if (vehId && !vehicles.some((v) => v.id === vehId)) setVehId(vehicles[0]?.id ?? null);
  }, [vehicles, vehId]);
  useEffect(() => { loadVehicle(vehId); }, [vehId, loadVehicle]);

  const vehicle = vehicles.find((v) => v.id === vehId) ?? null;
  const balance = ledger.reduce((s, r) => s + r.delta, 0);
  const isPaid = (vid: string, m: string) => paidMonths.some((p) => p.vehicle_id === vid && p.month === m);
  const sheet = sheets.find((s) => s.month === month) ?? null;
  const sum = useMemo(() => vehicle && summarize({
    month, consumption: num(vehicle.consumption), kmInitial: num(vehicle.km_initial), allTrips: trips, allRefuels: refuels,
    fuelStartFor: (m) => { const s = sheets.find((x) => x.month === m); return s && s.fuel_start !== null ? num(s.fuel_start) : null; },
  }), [vehicle, month, trips, refuels, sheets]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string, after: () => unknown = () => loadVehicle(vehId)) {
    const { error } = await p;
    if (error) { say(error.message.includes("row-level security") ? "Nu aveți drept pentru această operație sau luna nu este plătită pentru mașină." : "Eroare: " + error.message); return false; }
    say(ok); await after(); return true;
  }

  async function activate(vid: string, m: string) {
    const { data, error } = await sb.rpc("activate_vehicle_month", { p_vehicle: vid, p_month: m });
    if (error) { say(error.message); return; }
    say(data ? `Luna ${monthName(m)} este activă pentru mașină.` : "Nu aveți credite suficiente. Cumpărați un pachet din fila Credite.");
    await loadBase();
  }

  function openSheet() {
    if (!vehicle || !sum || !company) return;
    const w = window.open("", "_blank");
    if (!w) { say("Browserul a blocat fereastra nouă. Permiteți ferestrele pop-up pentru acest site."); return; }
    w.document.write(sheetHtml({ company, vehicle, month, sum, drivers, locations, sheetNo: sheet?.number ?? null, mainDriverId: sheet?.driver_id ?? null }));
    w.document.close();
  }
  function downloadCsv() {
    if (!vehicle || !sum) return;
    const blob = new Blob([sheetCsv({ sum, drivers, locations })], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `foaie-parcurs-${vehicle.plate.replace(/\s+/g, "")}-${month}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  const visibleTabs = TABS.filter((t) => t.roles.includes(role));
  const noVehicle = <div className="card empty">Nu există încă nicio mașină. {isAdmin ? "Adăugați prima mașină în fila Mașini." : "Administratorul firmei trebuie să adauge mașinile."}</div>;

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Norma · {company?.name ?? "…"}</h1>
          <p className="sub">{email} · {role === "admin" ? "administrator" : role === "contabil" ? "contabil" : "șofer"} · <b>{balance}</b> {balance === 1 ? "credit" : "credite"}</p>
        </div>
        <form action="/auth/signout" method="post"><button>Ieșire</button></form>
      </header>

      <div className="ctx">
        <label className="f" style={{ minWidth: 200 }}>Mașina
          <select id="selVeh" value={vehId ?? ""} onChange={(e) => setVehId(e.target.value)}>
            {vehicles.length ? vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.make ? " · " + v.make : ""}</option>) : <option value="">Nicio mașină</option>}
          </select>
        </label>
        <label className="f">Luna<input id="selLuna" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        {vehicle && <span className="plate">{vehicle.plate}</span>}
        {vehicle && (isPaid(vehicle.id, month)
          ? <span className="pill">lună plătită</span>
          : <span className="pill w">lună neplătită · doar citire</span>)}
        {vehicle && !isPaid(vehicle.id, month) && isAdmin && <button onClick={() => activate(vehicle.id, month)}>Activează luna (1 credit)</button>}
      </div>

      <nav className="tabs" role="tablist">
        {visibleTabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>

      {loading ? <div className="card empty">Se încarcă…</div> : (
        <main>
          {tab === "foaie" && (vehicle && sum ? <Foaie {...{ sb, vehicle, month, sum, sheet, drivers, locations, distances, companyId, isAdmin, canWrite: canTrips && isPaid(vehicle.id, month), run, openSheet, downloadCsv }} /> : noVehicle)}
          {tab === "gen" && (vehicle && sum ? <Generator {...{ sb, vehicle, month, sum, sheet, drivers, locations, distances, companyId, paid: isPaid(vehicle.id, month), run, say, onSaved: () => setTab("foaie") }} /> : noVehicle)}
          {tab === "masini" && <Masini {...{ sb, vehicles, drivers, companyId, isAdmin, run: (p, ok) => run(p, ok, loadBase) }} />}
          {tab === "soferi" && <Soferi {...{ sb, drivers, companyId, isAdmin, run: (p, ok) => run(p, ok, loadBase) }} />}
          {tab === "locatii" && <Locatii {...{ sb, locations, distances, companyId, isAdmin, run: (p, ok) => run(p, ok, loadBase), say }} />}
          {tab === "firma" && company && <Firma {...{ sb, company, isAdmin, run: (p, ok) => run(p, ok, loadBase) }} />}
          {tab === "credite" && <Credite {...{ vehicles, packages, ledger, balance, month, isPaid, isAdmin, activate }} />}
        </main>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
type Sb = ReturnType<typeof supabaseBrowser>;
type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;
const Opt = ({ list, label = (x: { name: string }) => x.name }: { list: { id: string; name: string }[]; label?: (x: { name: string }) => string }) =>
  <>{list.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</>;
const ConfirmDelete = ({ onConfirm }: { onConfirm: () => void }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button className="ghost" title="Șterge" style={armed ? { color: "var(--bad)" } : undefined} onClick={() => (armed ? onConfirm() : setArmed(true))}>{armed ? "Sigur?" : "✕"}</button>;
};

/* ---------------------------- Foaia lunară ---------------------------- */
function Foaie({ sb, vehicle, month, sum, sheet, drivers, locations, distances, companyId, isAdmin, canWrite, run, openSheet, downloadCsv }: {
  sb: Sb; vehicle: Vehicle; month: string; sum: NonNullable<ReturnType<typeof summarize>>; sheet: Sheet | null; drivers: Driver[]; locations: Location[];
  distances: Distance[]; companyId: string; isAdmin: boolean; canWrite: boolean; run: Run; openSheet: () => void; downloadCsv: () => void;
}) {
  const hq = locations.find((l) => l.is_hq);
  const [edit, setEdit] = useState<Trip | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const blank: Trip = { vehicle_id: vehicle.id, driver_id: sheet?.driver_id ?? vehicle.default_driver_id, trip_date: today.startsWith(month) ? today : month + "-01",
    time_start: "08:00", time_end: null, from_loc: hq?.id ?? null, to_loc: null, round_trip: true, route_text: null, purpose: "", km_start: sum.kmEnd, km_end: 0, generated: false };
  const [form, setForm] = useState<Trip>(blank);
  useEffect(() => { setForm(edit ?? blank); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [edit, vehicle.id, month, sum.kmEnd]);
  const auto = distanceKm(distances, form.from_loc, form.to_loc);
  const autoKm = auto ? auto * (form.round_trip ? 2 : 1) : null;

  async function saveTrip(e: React.FormEvent) {
    e.preventDefault();
    let kmEnd = num(form.km_end);
    if (!kmEnd) { if (!autoKm) return alertMsg("Completați km la sosire sau salvați distanța dintre locații."); kmEnd = num(form.km_start) + autoKm; }
    if (kmEnd < num(form.km_start)) return alertMsg("Km la sosire trebuie să fie mai mari decât km la plecare.");
    const loc = locations.find((l) => l.id === form.to_loc);
    const rec = { company_id: companyId, vehicle_id: vehicle.id, driver_id: form.driver_id || null, trip_date: form.trip_date, time_start: form.time_start || null,
      time_end: form.time_end || null, from_loc: form.from_loc || null, to_loc: form.to_loc || null, round_trip: form.round_trip,
      route_text: edit && (edit.from_loc !== form.from_loc || edit.to_loc !== form.to_loc) ? null : form.route_text,
      purpose: form.purpose || loc?.default_purpose || null, km_start: num(form.km_start), km_end: round1(kmEnd), generated: edit?.generated ?? false };
    const ok = await run(edit?.id ? sb.from("trips").update(rec).eq("id", edit.id) : sb.from("trips").insert(rec), edit ? "Cursa a fost modificată." : "Cursa a fost adăugată.");
    if (ok) setEdit(null);
  }
  const [msg, setMsg] = useState<string | null>(null);
  const alertMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };

  async function saveHeader(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e);
    await run(sb.from("sheets").upsert({ vehicle_id: vehicle.id, month, company_id: companyId, number: d.number || null, driver_id: d.driver_id || null,
      fuel_start: d.fuel_start === "" ? null : num(d.fuel_start) }), "Antetul foii a fost salvat.");
  }
  async function addRefuel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e); const f = e.currentTarget;
    if (await run(sb.from("refuels").insert({ company_id: companyId, vehicle_id: vehicle.id, refuel_date: d.refuel_date, liters: num(d.liters), amount: d.amount ? num(d.amount) : null, doc_no: d.doc_no || null }), "Alimentarea a fost adăugată.")) f.reset();
  }

  return (
    <section className="panel">
      {!canWrite && <div className="note"><b>Doar citire.</b> Luna {monthName(month)} nu este plătită pentru această mașină{isAdmin ? ". Activați-o din banda de sus, cu 1 credit." : ". Cereți administratorului să o activeze."}</div>}
      <div className="tiles">
        <div className="tile"><div className="l">Km parcurși</div><div className="v">{fmt(sum.km)}</div></div>
        <div className="tile"><div className="l">Curse</div><div className="v">{sum.trips.length}</div></div>
        <div className="tile"><div className="l">Consum normat (l)</div><div className="v">{fmt(sum.consumption, 2)}</div></div>
        <div className="tile"><div className="l">Alimentat (l) · lei</div><div className="v">{fmt(sum.refueled, 2)} · {fmt(sum.refuelValue, 2)}</div></div>
        <div className={"tile " + (sum.fuelEnd < 0 ? "bad" : "ok")}><div className="l">Stoc final rezervor (l)</div><div className="v">{fmt(sum.fuelEnd, 2)}</div></div>
      </div>
      {sum.fuelEnd < 0 && <div className="note"><b>Stoc negativ.</b> Consumul normat depășește combustibilul existent plus alimentările. Verificați alimentările sau stocul inițial.</div>}

      <div className="card">
        <div className="row between"><h2>Foaia de parcurs · {monthName(month)}</h2>
          <div className="row"><button onClick={openSheet}>Deschide pentru tipărire / PDF</button><button onClick={downloadCsv}>Descarcă pentru Excel (CSV)</button></div></div>
        <form className="grid" onSubmit={saveHeader} key={vehicle.id + month}>
          <label className="f">Nr. foaie<input name="number" defaultValue={sheet?.number ?? ""} placeholder="ex. 11/2026" disabled={!isAdmin} /></label>
          <label className="f">Șofer principal<select name="driver_id" defaultValue={sheet?.driver_id ?? vehicle.default_driver_id ?? ""} disabled={!isAdmin}><option value="">—</option><Opt list={drivers} /></select></label>
          <label className="f">Stoc inițial rezervor (l)<input name="fuel_start" inputMode="decimal" defaultValue={sheet?.fuel_start ?? ""} placeholder={`${fmt(sum.fuelStart, 2)} (preluat)`} disabled={!isAdmin} /></label>
          {isAdmin && <label className="f">&nbsp;<button>Salvează antetul</button></label>}
        </form>
        <div className="tablebox"><table>
          <thead><tr><th className="n">Nr.</th><th className="n">Data</th><th className="n">Ora</th><th>Șofer</th><th>Traseu</th><th>Scopul deplasării</th><th className="n">Km plecare</th><th className="n">Km sosire</th><th className="n">Km</th><th /></tr></thead>
          <tbody>
            {sum.trips.length ? sum.trips.map((t, i) => (
              <tr key={t.id} className={sum.gaps.includes(i) ? "warn" : ""}>
                <td className="n">{i + 1}</td><td className="n">{dateRo(t.trip_date)}</td><td className="n">{t.time_start?.slice(0, 5)}–{t.time_end?.slice(0, 5)}</td>
                <td>{drivers.find((d) => d.id === t.driver_id)?.name}</td>
                <td>{routeText(t, locations)} {sum.gaps.includes(i) && <span className="pill w" title="Km la plecare nu continuă km la sosire ai cursei anterioare">km discontinui</span>} {t.generated && <span className="pill">generat</span>}</td>
                <td>{t.purpose}</td><td className="n">{fmt(t.km_start)}</td><td className="n">{fmt(t.km_end)}</td><td className="n">{fmt(tripKm(t))}</td>
                <td>{canWrite && <><button className="ghost" title="Modifică" onClick={() => setEdit(t)}>✎</button><ConfirmDelete onConfirm={() => run(sb.from("trips").delete().eq("id", t.id!), "Cursa a fost ștearsă.")} /></>}</td>
              </tr>)) : <tr><td colSpan={10} className="empty">Nicio cursă în {monthName(month)}.</td></tr>}
          </tbody>
          {sum.trips.length > 0 && <tfoot><tr><td colSpan={6}>Total lună</td><td className="n">{fmt(sum.kmStart)}</td><td className="n">{fmt(sum.kmEnd)}</td><td className="n">{fmt(sum.km)}</td><td /></tr></tfoot>}
        </table></div>
      </div>

      {canWrite && <div className="two">
        <form className="card" onSubmit={saveTrip}>
          <h2>{edit ? "Modifică cursa" : "Adaugă cursă"}</h2>
          <div className="grid">
            <label className="f">Data<input type="date" required value={form.trip_date} onChange={(e) => setForm({ ...form, trip_date: e.target.value })} /></label>
            <label className="f">Ora plecare<input type="time" value={form.time_start?.slice(0, 5) ?? ""} onChange={(e) => setForm({ ...form, time_start: e.target.value })} /></label>
            <label className="f">Ora sosire<input type="time" value={form.time_end?.slice(0, 5) ?? ""} onChange={(e) => setForm({ ...form, time_end: e.target.value })} /></label>
            <label className="f">Șofer<select value={form.driver_id ?? ""} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}><option value="">—</option><Opt list={drivers} /></select></label>
            <label className="f">De la<select value={form.from_loc ?? ""} onChange={(e) => setForm({ ...form, from_loc: e.target.value })}><option value="">—</option><Opt list={locations} /></select></label>
            <label className="f">La<select value={form.to_loc ?? ""} onChange={(e) => { const l = locations.find((x) => x.id === e.target.value); setForm({ ...form, to_loc: e.target.value, purpose: form.purpose || l?.default_purpose || "" }); }}><option value="">—</option><Opt list={locations} /></select></label>
            <label className="chk" style={{ paddingTop: 18 }}><input type="checkbox" checked={form.round_trip} onChange={(e) => setForm({ ...form, round_trip: e.target.checked })} /> Dus-întors</label>
            <label className="f">Km plecare<input inputMode="decimal" required value={form.km_start} onChange={(e) => setForm({ ...form, km_start: e.target.value as unknown as number })} /></label>
            <label className="f">Km sosire<input inputMode="decimal" value={form.km_end || ""} placeholder={autoKm ? fmt(num(form.km_start) + autoKm, 1) : "din distanțe"} onChange={(e) => setForm({ ...form, km_end: e.target.value as unknown as number })} /></label>
          </div>
          <label className="f">Scopul deplasării<input value={form.purpose ?? ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="ex. depunere documente" /></label>
          <div className="row"><button className="pri">{edit ? "Salvează modificarea" : "Adaugă cursa"}</button>{edit && <button type="button" onClick={() => setEdit(null)}>Renunță</button>}
            <span className="muted">{autoKm ? `Distanța: ${fmt(autoKm, 1)} km` : form.from_loc && form.to_loc ? "Nu există distanță salvată între aceste locații." : "Km sosire gol = calculat din distanțe."}</span></div>
          {msg && <p className="err">{msg}</p>}
        </form>
        <div className="card"><h2>Alimentări</h2>
          <div className="tablebox"><table><thead><tr><th className="n">Data</th><th className="n">Litri</th><th className="n">Lei</th><th>Bon</th><th /></tr></thead>
            <tbody>{sum.refuels.length ? sum.refuels.map((a) => <tr key={a.id}><td className="n">{dateRo(a.refuel_date)}</td><td className="n">{fmt(a.liters, 2)}</td><td className="n">{fmt(a.amount ?? 0, 2)}</td><td>{a.doc_no}</td><td><ConfirmDelete onConfirm={() => run(sb.from("refuels").delete().eq("id", a.id), "Alimentarea a fost ștearsă.")} /></td></tr>)
              : <tr><td colSpan={5} className="empty">Nicio alimentare în această lună.</td></tr>}</tbody></table></div>
          <form className="grid" onSubmit={addRefuel}>
            <label className="f">Data<input type="date" name="refuel_date" required defaultValue={month + "-01"} /></label>
            <label className="f">Litri<input name="liters" inputMode="decimal" required /></label>
            <label className="f">Valoare (lei)<input name="amount" inputMode="decimal" /></label>
            <label className="f">Nr. bon<input name="doc_no" /></label>
            <label className="f">&nbsp;<button className="pri">Adaugă</button></label>
          </form>
        </div>
      </div>}
      {!canWrite && sum.refuels.length > 0 && <div className="card"><h2>Alimentări</h2><p>{sum.refuels.map((a) => `${dateRo(a.refuel_date)}: ${fmt(a.liters, 2)} l`).join(" · ")}</p></div>}
    </section>
  );
}

/* ---------------------------- Generator ---------------------------- */
function Generator({ sb, vehicle, month, sum, sheet, drivers, locations, distances, companyId, paid, run, say, onSaved }: {
  sb: Sb; vehicle: Vehicle; month: string; sum: NonNullable<ReturnType<typeof summarize>>; sheet: Sheet | null; drivers: Driver[]; locations: Location[]; distances: Distance[];
  companyId: string; paid: boolean; run: Run; say: (m: string) => void; onSaved: () => void;
}) {
  const hq = locations.find((l) => l.is_hq);
  const [days, setDays] = useState<string[]>(() => defaultWorkDays(month));
  const [p, setP] = useState({ ks: String(sum.kmEnd), ke: "", base: hq?.id ?? "", sof: sheet?.driver_id ?? vehicle.default_driver_id ?? "", max: 2, start: "08:00", fill: true });
  const [dest, setDest] = useState<string[]>(() => locations.filter((l) => !l.is_hq && distanceKm(distances, hq?.id ?? null, l.id)).map((l) => l.id));
  const [res, setRes] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDays(defaultWorkDays(month)); setRes(null); setP((x) => ({ ...x, ks: String(sum.kmEnd) })); }, [month, vehicle.id, sum.kmEnd]);

  function gen() {
    try {
      setRes(generateTrips({ vehicleId: vehicle.id, driverId: p.sof || null, kmStart: num(p.ks), kmEnd: num(p.ke), days, baseId: p.base, destIds: dest,
        maxPerDay: p.max, fillLocal: p.fill, startTime: p.start, locations, distances }));
    } catch (e) { say((e as Error).message); }
  }
  async function save() {
    if (!res) return; setBusy(true);
    const ok = await run(sb.from("trips").insert(res.trips.map((t) => ({ ...t, company_id: companyId, driver_id: t.driver_id || null, from_loc: t.from_loc || null, to_loc: t.to_loc || null }))), `Am adăugat ${res.trips.length} curse în foaia lunii.`);
    setBusy(false); if (ok) { setRes(null); onSaved(); }
  }
  const all = monthDays(month), off = weekday(all[0]);

  return (
    <section className="panel">
      <div className="note"><b>Important.</b> Generatorul propune o repartizare a kilometrilor pe curse, după locațiile și distanțele dumneavoastră. Fiecare cursă trebuie să corespundă unei deplasări reale în interes de serviciu. Verificați și corectați lista înainte de salvare.</div>
      {!paid && <div className="note"><b>Luna nu este plătită.</b> Puteți genera o propunere, dar o puteți salva doar după activarea lunii pentru această mașină.</div>}
      <div className="two">
        <div className="card"><h2>Parametri · {vehicle.plate} · {monthName(month)}</h2>
          <div className="grid">
            <label className="f">Km la bord la început<input inputMode="decimal" value={p.ks} onChange={(e) => setP({ ...p, ks: e.target.value })} /></label>
            <label className="f">Km la bord la sfârșit<input inputMode="decimal" value={p.ke} onChange={(e) => setP({ ...p, ke: e.target.value })} placeholder={`ex. ${fmt(num(p.ks) + 1200)}`} /></label>
            <label className="f">Plecare din<select value={p.base} onChange={(e) => setP({ ...p, base: e.target.value })}><option value="">—</option><Opt list={locations} /></select></label>
            <label className="f">Șofer<select value={p.sof} onChange={(e) => setP({ ...p, sof: e.target.value })}><option value="">—</option><Opt list={drivers} /></select></label>
            <label className="f">Max. curse pe zi<select value={p.max} onChange={(e) => setP({ ...p, max: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="f">Ora de început<input type="time" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={p.fill} onChange={(e) => setP({ ...p, fill: e.target.checked })} /> Completează diferența rămasă cu deplasări locale</label>
          <h3>Destinații folosite</h3>
          <div className="row">{locations.filter((l) => l.id !== p.base).map((l) => {
            const d = distanceKm(distances, p.base || null, l.id);
            return <label key={l.id} className="chk"><input type="checkbox" disabled={!d} checked={!!d && dest.includes(l.id)} onChange={(e) => setDest(e.target.checked ? [...dest, l.id] : dest.filter((x) => x !== l.id))} />
              {l.name} <span className="muted mono">{d ? `${fmt(d * 2)} km d-î` : "fără distanță"}</span></label>;
          })}{locations.length < 2 && <span className="muted">Adăugați locații și distanțe în fila Locații și distanțe.</span>}</div>
        </div>
        <div className="card"><h2>Zile lucrate</h2>
          <p className="muted">Implicit luni–vineri, fără sărbătorile legale cu dată fixă. Debifați manual Paștele, Rusaliile și concediile.</p>
          <div className="days">
            {["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"].map((z) => <div key={z} className="dh">{z}</div>)}
            {Array.from({ length: off }, (_, i) => <div key={"o" + i} />)}
            {all.map((d) => <button key={d} type="button" className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)}
              onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{Number(d.slice(8))}</button>)}
          </div>
          <div className="row"><button className="pri" onClick={gen}>Generează propunerea</button><span className="muted">{days.length} zile selectate</span></div>
        </div>
      </div>
      {res && <div className="card">
        <div className="row between"><h2>Propunere: {res.trips.length} curse · {fmt(res.total)} km</h2>
          <div className="row"><button onClick={gen}>Generează altă variantă</button><button className="pri" disabled={!paid || busy} onClick={save}>Adaugă în foaia lunii</button></div></div>
        {res.leftover > 0 && <div className="note">Au rămas {fmt(res.leftover)} km nerepartizați. Bifați completarea cu deplasări locale sau ajustați km de sfârșit.</div>}
        <div className="tablebox"><table><thead><tr><th className="n">Data</th><th className="n">Ora</th><th>Traseu</th><th>Scop</th><th className="n">Km plecare</th><th className="n">Km sosire</th><th className="n">Km</th></tr></thead>
          <tbody>{res.trips.map((t, i) => <tr key={i}><td className="n">{dateRo(t.trip_date)}</td><td className="n">{t.time_start}–{t.time_end}</td><td>{routeText(t, locations)}</td><td>{t.purpose}</td><td className="n">{fmt(t.km_start)}</td><td className="n">{fmt(t.km_end)}</td><td className="n">{fmt(tripKm(t))}</td></tr>)}</tbody>
        </table></div>
      </div>}
    </section>
  );
}

/* ---------------------------- Mașini / Șoferi / Locații / Firmă ---------------------------- */
function Masini({ sb, vehicles, drivers, companyId, isAdmin, run }: { sb: Sb; vehicles: Vehicle[]; drivers: Driver[]; companyId: string; isAdmin: boolean; run: Run }) {
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e); const f = e.currentTarget;
    if (await run(sb.from("vehicles").insert({ company_id: companyId, plate: d.plate.toUpperCase().trim(), make: d.make || null, fuel: d.fuel, consumption: num(d.consumption), km_initial: num(d.km_initial), default_driver_id: d.default_driver_id || null }), "Mașina a fost adăugată.")) f.reset();
  }
  return (
    <section className="panel"><div className="card"><h2>Mașini</h2>
      <p className="muted">O mașină activă consumă 1 credit pe lună, pe 1 ale lunii. Dezactivați mașinile pe care nu le mai folosiți.</p>
      <div className="tablebox"><table><thead><tr><th>Nr. înmatriculare</th><th>Marcă / model</th><th>Combustibil</th><th className="n">Consum l/100 km</th><th className="n">Km inițiali</th><th>Șofer implicit</th><th>Activă</th><th /></tr></thead>
        <tbody>{vehicles.length ? vehicles.map((v) => <tr key={v.id}><td className="mono">{v.plate}</td><td>{v.make}</td><td>{v.fuel}</td><td className="n">{fmt(v.consumption, 1)}</td><td className="n">{fmt(v.km_initial)}</td>
          <td>{drivers.find((d) => d.id === v.default_driver_id)?.name}</td>
          <td><input type="checkbox" aria-label="Activă" checked={v.active} disabled={!isAdmin} onChange={(e) => run(sb.from("vehicles").update({ active: e.target.checked }).eq("id", v.id), e.target.checked ? "Mașina este activă." : "Mașina a fost dezactivată.")} /></td>
          <td>{isAdmin && <ConfirmDelete onConfirm={() => run(sb.from("vehicles").delete().eq("id", v.id), "Mașina a fost ștearsă.")} />}</td></tr>)
          : <tr><td colSpan={8} className="empty">Nicio mașină încă.</td></tr>}</tbody></table></div>
      {isAdmin && <form className="grid" onSubmit={add}>
        <label className="f">Nr. înmatriculare<input name="plate" required placeholder="CJ 12 ABC" /></label>
        <label className="f">Marcă / model<input name="make" /></label>
        <label className="f">Combustibil<select name="fuel"><option>Motorină</option><option>Benzină</option><option>GPL</option><option>Hibrid</option><option>Electric</option></select></label>
        <label className="f">Consum normat (l/100 km)<input name="consumption" inputMode="decimal" required /></label>
        <label className="f">Km la bord la început<input name="km_initial" inputMode="decimal" /></label>
        <label className="f">Șofer implicit<select name="default_driver_id"><option value="">—</option><Opt list={drivers} /></select></label>
        <label className="f">&nbsp;<button className="pri">Adaugă mașina</button></label>
      </form>}
      <p className="muted">Consumul normat se stabilește de regulă prin decizie internă a firmei. Verificați valoarea cu contabilul.</p>
    </div></section>
  );
}

function Soferi({ sb, drivers, companyId, isAdmin, run }: { sb: Sb; drivers: Driver[]; companyId: string; isAdmin: boolean; run: Run }) {
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e); const f = e.currentTarget;
    if (await run(sb.from("drivers").insert({ company_id: companyId, name: d.name.trim(), job_title: d.job_title || null, license_no: d.license_no || null }), "Șoferul a fost adăugat.")) f.reset();
  }
  return (
    <section className="panel"><div className="card"><h2>Șoferi</h2>
      <div className="tablebox"><table><thead><tr><th>Nume</th><th>Funcție</th><th>Nr. permis</th><th /></tr></thead>
        <tbody>{drivers.length ? drivers.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.job_title}</td><td className="mono">{s.license_no}</td><td>{isAdmin && <ConfirmDelete onConfirm={() => run(sb.from("drivers").delete().eq("id", s.id), "Șoferul a fost șters.")} />}</td></tr>)
          : <tr><td colSpan={4} className="empty">Niciun șofer încă.</td></tr>}</tbody></table></div>
      {isAdmin && <form className="grid" onSubmit={add}>
        <label className="f">Nume și prenume<input name="name" required /></label>
        <label className="f">Funcție<input name="job_title" /></label>
        <label className="f">Nr. permis<input name="license_no" /></label>
        <label className="f">&nbsp;<button className="pri">Adaugă șoferul</button></label>
      </form>}
    </div></section>
  );
}

function Locatii({ sb, locations, distances, companyId, isAdmin, run, say }: { sb: Sb; locations: Location[]; distances: Distance[]; companyId: string; isAdmin: boolean; run: Run; say: (m: string) => void }) {
  const name = (id: string) => locations.find((l) => l.id === id)?.name ?? "";
  const sorted = [...locations].sort((a, b) => Number(b.is_hq) - Number(a.is_hq) || a.name.localeCompare(b.name));
  async function addLoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e); const f = e.currentTarget;
    if (await run(sb.from("locations").insert({ company_id: companyId, name: d.name.trim(), city: d.city || null, default_purpose: d.default_purpose || null, is_hq: d.is_hq === "on" }), "Locația a fost adăugată.")) f.reset();
  }
  async function addDist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e); const f = e.currentTarget;
    if (!d.loc_a || !d.loc_b || d.loc_a === d.loc_b) return say("Alegeți două locații diferite.");
    const ex = distances.find((x) => (x.loc_a === d.loc_a && x.loc_b === d.loc_b) || (x.loc_a === d.loc_b && x.loc_b === d.loc_a));
    const q = ex ? sb.from("distances").update({ km: num(d.km) }).eq("id", ex.id) : sb.from("distances").insert({ company_id: companyId, loc_a: d.loc_a, loc_b: d.loc_b, km: num(d.km) });
    if (await run(q, "Distanța a fost salvată.")) f.reset();
  }
  return (
    <section className="panel"><div className="two">
      <div className="card"><h2>Locații</h2><p className="muted">Sediul, primăriile, clienții și alte puncte între care circulați. Marcați sediul ca punct de plecare.</p>
        <div className="tablebox"><table><thead><tr><th>Denumire</th><th>Localitate</th><th>Scop implicit</th><th /></tr></thead>
          <tbody>{sorted.length ? sorted.map((l) => <tr key={l.id}><td>{l.name} {l.is_hq && <span className="pill">sediu</span>}</td><td>{l.city}</td><td>{l.default_purpose}</td><td>{isAdmin && <ConfirmDelete onConfirm={() => run(sb.from("locations").delete().eq("id", l.id), "Locația a fost ștearsă.")} />}</td></tr>)
            : <tr><td colSpan={4} className="empty">Nicio locație încă.</td></tr>}</tbody></table></div>
        {isAdmin && <form className="grid" onSubmit={addLoc}>
          <label className="f">Denumire<input name="name" required placeholder="Primăria Florești" /></label>
          <label className="f">Localitate<input name="city" /></label>
          <label className="f">Scop implicit<input name="default_purpose" placeholder="depunere documente" /></label>
          <label className="chk" style={{ paddingTop: 18 }}><input type="checkbox" name="is_hq" /> Este sediul</label>
          <label className="f">&nbsp;<button className="pri">Adaugă locația</button></label>
        </form>}
      </div>
      <div className="card"><h2>Distanțe (km, un sens)</h2><p className="muted">Introduceți o singură dată distanța dintre două locații. Se folosește la curse și la generator.</p>
        <div className="tablebox"><table><thead><tr><th>De la</th><th>La</th><th className="n">Km</th><th /></tr></thead>
          <tbody>{distances.length ? distances.map((d) => <tr key={d.id}><td>{name(d.loc_a)}</td><td>{name(d.loc_b)}</td><td className="n">{fmt(d.km, 1)}</td><td>{isAdmin && <ConfirmDelete onConfirm={() => run(sb.from("distances").delete().eq("id", d.id), "Distanța a fost ștearsă.")} />}</td></tr>)
            : <tr><td colSpan={4} className="empty">Nicio distanță încă.</td></tr>}</tbody></table></div>
        {isAdmin && <form className="grid" onSubmit={addDist}>
          <label className="f">De la<select name="loc_a" required><option value="">—</option><Opt list={sorted} /></select></label>
          <label className="f">La<select name="loc_b" required><option value="">—</option><Opt list={sorted} /></select></label>
          <label className="f">Km<input name="km" inputMode="decimal" required /></label>
          <label className="f">&nbsp;<button className="pri">Salvează distanța</button></label>
        </form>}
      </div>
    </div></section>
  );
}

function Firma({ sb, company, isAdmin, run }: { sb: Sb; company: Company; isAdmin: boolean; run: Run }) {
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const d = fd(e);
    await run(sb.from("companies").update({ name: d.name.trim(), cui: d.cui || null, reg_com: d.reg_com || null, address: d.address || null, approved_by: d.approved_by || null }).eq("id", company.id), "Datele firmei au fost salvate.");
  }
  return (
    <section className="panel">
      <form className="card" onSubmit={save}><h2>Datele firmei (apar în antetul foii)</h2>
        <div className="grid">
          <label className="f">Denumire<input name="name" required defaultValue={company.name} disabled={!isAdmin} /></label>
          <label className="f">CUI<input name="cui" defaultValue={company.cui ?? ""} disabled={!isAdmin} /></label>
          <label className="f">Nr. Reg. Com.<input name="reg_com" defaultValue={company.reg_com ?? ""} disabled={!isAdmin} /></label>
          <label className="f">Sediu<input name="address" defaultValue={company.address ?? ""} disabled={!isAdmin} /></label>
          <label className="f">Aprobat de (administrator)<input name="approved_by" defaultValue={company.approved_by ?? ""} disabled={!isAdmin} /></label>
        </div>
        {isAdmin && <div className="row"><button className="pri">Salvează</button></div>}
      </form>
      <div className="note"><b>De verificat cu contabilul.</b> Câmpurile foii de parcurs trebuie confirmate de un contabil, iar cerințele legale (OMFP 2634/2015, Codul fiscal) se pot schimba.</div>
    </section>
  );
}

/* ---------------------------- Credite ---------------------------- */
const REASON: Record<string, string> = { proba: "Credit gratuit", cumparare: "Cumpărare", consum: "Consum lunar", rambursare: "Rambursare", ajustare: "Ajustare" };
function Credite({ vehicles, packages, ledger, balance, month, isPaid, isAdmin, activate }: {
  vehicles: Vehicle[]; packages: CreditPackage[]; ledger: LedgerRow[]; balance: number; month: string;
  isPaid: (v: string, m: string) => boolean; isAdmin: boolean; activate: (v: string, m: string) => void;
}) {
  const active = vehicles.filter((v) => v.active);
  return (
    <section className="panel">
      <div className="tiles">
        <div className={"tile " + (balance > 0 ? "ok" : "bad")}><div className="l">Credite disponibile</div><div className="v">{balance}</div></div>
        <div className="tile"><div className="l">Mașini active</div><div className="v">{active.length}</div></div>
        <div className="tile"><div className="l">Necesar lunar</div><div className="v">{active.length} credite</div></div>
      </div>
      <div className="card"><h2>Mașini în {monthName(month)}</h2>
        <div className="tablebox"><table><thead><tr><th>Mașina</th><th>Stare</th><th /></tr></thead>
          <tbody>{vehicles.map((v) => <tr key={v.id}><td className="mono">{v.plate}</td>
            <td>{isPaid(v.id, month) ? <span className="pill">plătită</span> : v.active ? <span className="pill w">neplătită</span> : <span className="pill b">inactivă</span>}</td>
            <td>{isAdmin && !isPaid(v.id, month) && <button onClick={() => activate(v.id, month)}>Activează (1 credit)</button>}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card"><h2>Pachete de credite</h2>
        <div className="tiles">{packages.map((p) => <div key={p.code} className="tile pack">
          <h3>{p.name}</h3><div className="v">{p.credits} credite</div>
          <div className="muted">{p.price_ron ? `${fmt(p.price_ron, 2)} lei` : "Prețul va fi anunțat"}</div>
          <button disabled title="Plata online va fi disponibilă în curând">Cumpără</button>
        </div>)}</div>
        <p className="muted">Plata cu cardul (Netopia) și factura automată (SmartBill) vin în etapa următoare.</p>
      </div>
      <div className="card"><h2>Istoric credite</h2>
        <div className="tablebox"><table><thead><tr><th className="n">Data</th><th>Operație</th><th>Detalii</th><th className="n">Credite</th></tr></thead>
          <tbody>{ledger.map((r) => <tr key={r.id}><td className="n">{dateRo(r.created_at.slice(0, 10))}</td><td>{REASON[r.reason] ?? r.reason}</td>
            <td>{r.vehicle_id ? vehicles.find((v) => v.id === r.vehicle_id)?.plate + " · " : ""}{r.note}</td><td className="n">{r.delta > 0 ? "+" : ""}{r.delta}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  );
}
