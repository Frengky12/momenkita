import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || data.claims.is_anonymous) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      {/* Navbar melayang mengikuti referensi: kartu bulat dengan border tipis, menempel di atas saat scroll. */}
      <header className="sticky top-3 z-40 print:hidden mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border bg-card px-3 py-1.5 shadow-inner sm:mx-auto sm:w-full sm:max-w-3xl">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-md px-1">
          <Wordmark className="text-lg" />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{data.claims.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11">
              Keluar
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
