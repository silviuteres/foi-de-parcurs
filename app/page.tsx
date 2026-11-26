import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Norma – foi de parcurs</h1>
          <p className="sub">Foile de parcurs ale firmei, completate pe fiecare mașină: curse, kilometraj, alimentări și consum normat.</p>
        </div>
        <Link href="/login"><button className="pri">Intră în cont</button></Link>
      </header>
      <div className="two">
        <div className="card"><h2>Evidență pe fiecare mașină</h2><p className="muted">Curse, km la bord, alimentări și stocul din rezervor, separat pentru fiecare mașină.</p></div>
        <div className="card"><h2>Generator de curse</h2><p className="muted">Propune curse dus-întors între sediu și locațiile obișnuite, cu km continui. Verificați fiecare cursă înainte de salvare.</p></div>
        <div className="card"><h2>Plătiți doar mașinile active</h2><p className="muted">1 credit = o mașină pentru o lună. La înscriere primiți 1 credit gratuit.</p></div>
      </div>
    </main>
  );
}
