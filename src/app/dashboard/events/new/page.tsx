import Link from "next/link";
import { headers } from "next/headers";
import { CreateEventForm } from "./create-event-form";

export default async function NewEventPage() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center text-sm text-muted-foreground hover:text-foreground">
          Kembali ke daftar event
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Buat undangan pernikahan</h1>
        <p className="text-sm text-muted-foreground">Gratis dirakit dan dipratinjau. Pembayaran baru diminta saat undangan dipublikasikan.</p>
      </div>
      <CreateEventForm origin={origin} />
    </section>
  );
}
