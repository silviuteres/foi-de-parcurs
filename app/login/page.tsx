"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const MESAJE: Record<string, string> = {
  "Invalid login credentials": "E-mailul sau parola nu sunt corecte.",
  "User already registered": "Există deja un cont cu acest e-mail. Intrați în cont.",
  "Email not confirmed": "Confirmați întâi adresa de e-mail din mesajul primit.",
};

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) setMsg(MESAJE[error.message] ?? error.message); else router.replace("/app");
    } else {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) setMsg(MESAJE[error.message] ?? error.message);
      else if (data.session) router.replace("/onboarding");
      else setMsg("Am trimis un e-mail de confirmare. Deschideți linkul din el, apoi reveniți aici.");
    }
    setBusy(false);
  }

  return (
    <main className="wrap narrow">
      <h1>Norma – foi de parcurs</h1>
      <form className="card" onSubmit={submit}>
        <h2>{mode === "in" ? "Intră în cont" : "Cont nou"}</h2>
        <label className="f">E-mail<input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="f">Parolă<input id="pass" type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={pass} onChange={(e) => setPass(e.target.value)} /></label>
        {msg && <p className="err">{msg}</p>}
        <button className="pri" disabled={busy}>{mode === "in" ? "Intră" : "Creează contul"}</button>
        <button type="button" className="ghost" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
          {mode === "in" ? "Nu aveți cont? Creați unul" : "Aveți deja cont? Intrați"}
        </button>
      </form>
    </main>
  );
}
