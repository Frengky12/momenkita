import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { CATEGORY_LABELS, RSVP_LABELS } from "@/lib/guests";
import { STAFF_ROLES, isStaffRole } from "@/lib/staff/roles";
import { createClient } from "@/lib/supabase/server";

// Laporan buku tamu (PRD §5.5): daftar hadir, waktu check-in, jumlah orang, dan ucapan, dalam satu file XLSX.
// Data dibaca lewat sesi host (RLS), jadi hanya pengelola event yang bisa mengunduhnya.

const UTC_OFFSET_HOURS: Record<string, number> = { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 };
const SOURCE_LABEL: Record<string, string> = { manual: "Ditambah manual", import: "Impor", public_rsvp: "RSVP link umum", walk_in: "Walk-in" };
const DATE_FORMAT = "dd/mm/yyyy hh:mm";

const header = (labels: string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" }));

export async function GET(_request: Request, { params }: RouteContext<"/dashboard/events/[eventId]/tamu/laporan">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug, timezone").eq("id", eventId).maybeSingle();
  if (!event) return new Response("Event tidak ditemukan", { status: 404 });

  const [{ data: sessions }, { data: guests }, { data: wishes }, { data: links }] = await Promise.all([
    supabase.from("event_sessions").select("id, name").eq("event_id", eventId).order("starts_at"),
    supabase
      .from("invitations")
      .select("guest_name, category, table_number, pax_allowed, session_ids, rsvp_status, rsvp_pax, checked_in_at, checked_in_pax, checked_in_by_staff_link_id, checked_in_by_profile_id, source")
      .eq("event_id", eventId)
      .order("guest_name"),
    supabase.from("wishes").select("author_name, message, created_at, is_hidden").eq("event_id", eventId).order("created_at"),
    supabase.from("staff_links").select("id, role, label").eq("event_id", eventId),
  ]);
  if (!guests || !wishes) return new Response("Laporan gagal dibuat. Coba lagi.", { status: 500 });

  // Excel tidak menyimpan zona waktu: tanggal digeser ke jam lokal event (WIB/WITA/WIT) agar tampil sesuai jam acara.
  const offset = (UTC_OFFSET_HOURS[event.timezone] ?? 7) * 3_600_000;
  const localDate = (iso: string | null): Cell => (iso ? { value: new Date(Date.parse(iso) + offset), type: Date, format: DATE_FORMAT } : null);
  const sessionList = sessions ?? [];
  const sessionNames = (ids: string[]) => (ids.length ? sessionList.filter((s) => ids.includes(s.id)).map((s) => s.name).join(", ") : "Semua sesi");
  const recorder = (linkId: string | null, profileId: string | null) => {
    const link = (links ?? []).find((l) => l.id === linkId);
    if (link) return link.label || (isStaffRole(link.role) ? STAFF_ROLES[link.role].label : link.role);
    return profileId ? "Host" : null;
  };

  const attendance: Row[] = [
    header(["Nama tamu", "Kategori", "Meja", "Sesi", "RSVP", "Jumlah RSVP", "Jatah orang", "Check-in", "Jumlah hadir", "Dicatat oleh", "Asal data"]),
    ...guests.map((g): Row => [
      g.guest_name,
      CATEGORY_LABELS[g.category as keyof typeof CATEGORY_LABELS] ?? g.category,
      g.table_number,
      sessionNames(g.session_ids),
      RSVP_LABELS[g.rsvp_status] ?? g.rsvp_status,
      g.rsvp_pax,
      g.pax_allowed,
      localDate(g.checked_in_at),
      g.checked_in_pax,
      recorder(g.checked_in_by_staff_link_id, g.checked_in_by_profile_id),
      SOURCE_LABEL[g.source] ?? g.source,
    ]),
  ];

  const wishRows: Row[] = [
    header(["Nama", "Ucapan", "Waktu", "Tampil di undangan"]),
    ...wishes.map((w): Row => [w.author_name, w.message, localDate(w.created_at), w.is_hidden ? "Disembunyikan" : "Ya"]),
  ];

  const recapRow = (label: string, list: typeof guests): Row => {
    const present = list.filter((g) => g.checked_in_at);
    return [
      label,
      list.length,
      present.length,
      present.reduce((sum, g) => sum + (g.checked_in_pax ?? 0), 0),
      list.length ? { value: present.length / list.length, format: "0%" } : null,
    ];
  };
  const recap: Row[] = [
    header(["Kelompok", "Undangan", "Undangan hadir", "Orang hadir", "Persentase hadir"]),
    recapRow("Semua tamu", guests),
    ...Object.entries(CATEGORY_LABELS).map(([key, label]) => recapRow(`Kategori: ${label}`, guests.filter((g) => g.category === key))),
    ...(sessionList.length > 1
      ? sessionList.map((s) => recapRow(`Sesi: ${s.name}`, guests.filter((g) => !g.session_ids.length || g.session_ids.includes(s.id))))
      : []),
  ];

  const buffer = await writeXlsxFile([
    { data: attendance, sheet: "Kehadiran", stickyRowsCount: 1, columns: [{ width: 32 }, { width: 11 }, { width: 8 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 11 }, { width: 17 }, { width: 13 }, { width: 16 }, { width: 16 }] },
    { data: wishRows, sheet: "Ucapan", stickyRowsCount: 1, columns: [{ width: 28 }, { width: 70 }, { width: 17 }, { width: 18 }] },
    { data: recap, sheet: "Rekap", columns: [{ width: 28 }, { width: 11 }, { width: 16 }, { width: 13 }, { width: 17 }] },
  ]).toBuffer();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone }).format(new Date()).replaceAll("-", "");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="laporan-tamu-${event.slug}-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
