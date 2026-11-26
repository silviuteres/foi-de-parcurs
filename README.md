# Norma – foi de parcurs

Platformă web pentru foile de parcurs ale firmelor: curse, kilometraj, alimentări și foaia lunară, cu evidență separată pe fiecare mașină. Accesul se plătește în credite: **1 credit = o mașină activă pentru o lună**.

## Tehnologie

- **Next.js 15** (aplicația web), găzduit pe **Vercel**
- **Supabase** (baza de date Postgres, conturi de utilizator, reguli de acces pe firmă)
- Plăți: **Netopia Payments** (etapa 3) · Facturare: **SmartBill** cu e-Factura (etapa 4)

## Ce conține etapa 2 (platforma de bază)

- Cont nou / autentificare, înregistrarea firmei (primește 1 credit gratuit)
- Roluri: administrator, contabil (doar citire), șofer (adaugă curse și alimentări)
- Ecranele din prototip: foaia lunară, generatorul de curse, mașini, șoferi, locații și distanțe, datele firmei
- Pagina **Credite**: sold, mașini plătite în lună, pachetele Starter / Premium / Ultra (prețul se stabilește ulterior), istoric
- Consum automat de credite pe 1 ale lunii (Vercel Cron → `/api/cron/monthly`)
- O lună neplătită pentru o mașină rămâne doar pentru citire (regula e impusă și în baza de date)

## Pornire

### 1. Supabase
1. Creați un proiect pe [supabase.com](https://supabase.com), regiunea UE (ex. Frankfurt).
2. În **SQL Editor**, rulați conținutul fișierului `supabase/migrations/20261126000001_init.sql`.
3. În **Authentication → URL Configuration**, setați *Site URL* la adresa aplicației (ex. `https://foi.domeniul-dvs.ro`) și adăugați `https://foi.domeniul-dvs.ro/auth/callback` la *Redirect URLs*.
4. Din **Project Settings → API** copiați *Project URL*, cheia *anon* și cheia *service_role*.

### 2. Vercel
1. Importați depozitul GitHub în Vercel.
2. La **Settings → Environment Variables** adăugați variabilele din `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (un șir aleator lung).
3. La **Settings → Domains** adăugați subdomeniul (ex. `foi.domeniul-dvs.ro`) și creați înregistrarea DNS indicată de Vercel.

> Notă: sarcinile programate (Cron) și uzul comercial pot cere un plan plătit Vercel. Verificați condițiile planului înainte de lansare.

### 3. Local
```bash
cp .env.example .env.local   # completați valorile
npm install
npm run dev                  # http://localhost:3000
npm test                     # testele pentru calcule și generator
```

## Important

- Generatorul de curse doar **propune** curse; fiecare trebuie să corespundă unei deplasări reale.
- Câmpurile foii de parcurs și regimul fiscal al creditelor trebuie confirmate cu un contabil.
