import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { signOut } from "../dashboard/actions";
import { AdminNav } from "./admin-nav";
import { requireAdmin } from "./guard";

// Area khusus profil ber-role admin. Selain admin mendapat 404 agar keberadaan halaman ini tidak terbaca (lihat guard.ts).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-3 z-40 mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border bg-card px-3 py-1.5 shadow-inner sm:mx-auto sm:w-full sm:max-w-5xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1">
          <Wordmark className="text-lg" />
          <span className="whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">Admin</span>
        </Link>
        <div className="flex min-w-0 items-center">
          <Button asChild variant="ghost" className="h-11">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11">
              Keluar
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <AdminNav />
        <main className="flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
