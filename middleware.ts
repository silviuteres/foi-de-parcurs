import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reîmprospătează sesiunea și trimite la autentificare vizitatorii nelogați din zona /app.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const p = req.nextUrl.pathname;
  if (!user && (p.startsWith("/app") || p.startsWith("/onboarding"))) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/app/:path*", "/onboarding/:path*", "/login"] };
