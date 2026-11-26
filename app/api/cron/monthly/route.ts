import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Rulată de Vercel Cron pe 1 ale lunii (vezi vercel.json): consumă câte 1 credit
// pentru fiecare mașină activă. Mașinile fără credit rămân doar pentru citire în acea lună.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "neautorizat" }, { status: 401 });
  }
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  const month = req.nextUrl.searchParams.get("luna") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "lună invalidă" }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc("run_monthly_billing", { p_month: month });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ month, result: data });
}
