"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cui, setCui] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().rpc("create_company", { p_name: name.trim(), p_cui: cui.trim() || null });
    if (error) { setErr("Firma nu a putut fi creată: " + error.message); setBusy(false); return; }
    router.replace("/app");
  }

  return (
    <main className="wrap narrow">
      <h1>Înregistrați firma</h1>
      <form className="card" onSubmit={submit}>
        <p className="muted">Veți fi administratorul firmei. Primiți 1 credit gratuit, adică o mașină pentru o lună.</p>
        <label className="f">Denumirea firmei<input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Transport Exemplu SRL" /></label>
        <label className="f">CUI (opțional)<input id="cui" value={cui} onChange={(e) => setCui(e.target.value)} /></label>
        {err && <p className="err">{err}</p>}
        <button className="pri" disabled={busy}>Creează firma</button>
      </form>
    </main>
  );
}
