import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Workspace from "@/components/Workspace";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: mem } = await sb.from("memberships").select("company_id, role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!mem) redirect("/onboarding");
  return <Workspace companyId={mem.company_id as string} role={mem.role as Role} email={user.email ?? ""} />;
}
