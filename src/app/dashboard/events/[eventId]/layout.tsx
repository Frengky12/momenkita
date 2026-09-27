import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventTabs } from "./event-tabs";

const STATUS_LABEL: Record<string, string> = { draft: "Draf", active: "Aktif", completed: "Selesai", expired: "Kedaluwarsa" };

export default async function EventLayout({ children, params }: LayoutProps<"/dashboard/events/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, title, slug, status, published_at").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 print:hidden">
        <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center text-sm text-muted-foreground hover:text-foreground">
          Kembali ke daftar event
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {STATUS_LABEL[event.status] ?? event.status} · /{event.slug}
          {!event.published_at && " · belum dipublikasikan"}
        </p>
      </div>
      <EventTabs eventId={event.id} />
      {children}
    </div>
  );
}
