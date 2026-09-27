"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCamera } from "@/components/staff/qr-camera";
import { StaffGate } from "@/components/staff/staff-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { subscribeEvent, type StaffAccess } from "@/lib/staff/access";
import {
  applyQueue,
  flushQueue,
  loadGuests,
  loadQueue,
  mergeGuest,
  normalizeName,
  saveGuests,
  saveQueue,
  type Guest,
  type PendingAction,
} from "@/lib/staff/checkin-store";
import { useOnline } from "@/lib/staff/hooks";

const CATEGORY_LABEL: Record<string, string> = { vip: "VIP", family: "Keluarga", regular: "Reguler" };
const RSVP_LABEL: Record<string, string> = { attending: "hadir", declined: "tidak hadir", maybe: "ragu", pending: "belum menjawab" };
const QR_PATTERN = /^[0-9a-f]{32}$/;
const MAX_PAX = 20;

type View = "scan" | "search" | "recap";

export function ScannerPage({ eventId }: { eventId: string }) {
  return <StaffGate eventId={eventId} role="receptionist">{(access) => <Scanner access={access} />}</StaffGate>;
}

function Scanner({ access }: { access: StaffAccess }) {
  const { client, event } = access;
  const [first, second] = coupleNames(parseContent(event.theme_config));
  const title = first.nickname && second.nickname ? `${first.nickname} & ${second.nickname}` : event.title;
  const time = useCallback(
    (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: event.timezone }),
    [event.timezone],
  );

  // Ref dan state diperbarui bersamaan: handler scan/realtime butuh data terbaru tanpa menunggu render.
  const [initial] = useState(() => {
    const queue = loadQueue(event.id);
    return { queue, guests: applyQueue(loadGuests(event.id), queue) };
  });
  const queueRef = useRef(initial.queue);
  const guestsRef = useRef(initial.guests);
  const [guests, setGuestsState] = useState(initial.guests);
  const [queue, setQueueState] = useState(initial.queue);
  const setGuests = useCallback(
    (update: (list: Guest[]) => Guest[]) => {
      guestsRef.current = update(guestsRef.current);
      setGuestsState(guestsRef.current);
      saveGuests(event.id, guestsRef.current);
    },
    [event.id],
  );
  const setQueue = useCallback(
    (next: PendingAction[]) => {
      queueRef.current = next;
      setQueueState(next);
      saveQueue(event.id, next);
    },
    [event.id],
  );

  const [listState, setListState] = useState<"loading" | "ready" | "error">(initial.guests.length ? "ready" : "loading");
  const [live, setLive] = useState(false);
  const online = useOnline();
  const [forbidden, setForbidden] = useState(false);
  const [view, setView] = useState<View>("scan");
  const [selected, setSelected] = useState<Guest | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string; at: number } | null>(null);
  const flushingRef = useRef(false);

  const notify = useCallback((tone: "ok" | "warn", text: string) => setNotice({ tone, text, at: Date.now() }), []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const refreshList = useCallback(async () => {
    const { data, error } = await client.rpc("staff_guest_list", { p_event_id: event.id });
    if (error) {
      setListState((s) => (s === "ready" ? s : "error"));
      return false;
    }
    setGuests(() => applyQueue(data as Guest[], queueRef.current));
    setListState("ready");
    return true;
  }, [client, event.id, setGuests]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    // Diulang sampai kosong: check-in yang masuk selama pengiriman ikut terkirim tanpa menunggu jadwal berikutnya.
    while (queueRef.current.length) {
      const snapshot = queueRef.current;
      const { remaining, blocked } = await flushQueue(client, event.id, snapshot, (outcome) => {
        if (outcome.status === "dropped") {
          setGuests((list) => (outcome.action.kind === "walkin" ? list.filter((g) => g.id !== outcome.action.id) : list));
          notify("warn", `Check-in ${outcome.action.name} gagal disimpan. Coba cari namanya dan check-in lagi.`);
          return;
        }
        const { card, action } = outcome;
        setGuests((list) => mergeGuest(list, card));
        // Perangkat lain lebih dulu check-in selama perangkat ini offline.
        if (outcome.already && card.checked_in_at && Math.abs(Date.parse(card.checked_in_at) - Date.parse(action.at)) > 1000) {
          notify("warn", `${card.guest_name} ternyata sudah check-in pukul ${time(card.checked_in_at)}${card.checked_in_by ? ` oleh ${card.checked_in_by}` : ""}.`);
        }
      });
      setQueue(queueRef.current.slice(snapshot.length - remaining.length));
      setForbidden(blocked === "forbidden");
      if (blocked) break;
    }
    flushingRef.current = false;
  }, [client, event.id, notify, setGuests, setQueue, time]);

  useEffect(() => {
    const boot = setTimeout(async () => {
      await refreshList();
      flush();
    }, 0);
    let everLive = false;
    const unsubscribe = subscribeEvent(
      client,
      event.id,
      {
        invitation: (p) => {
          const card = p as Partial<Guest> & { id: string };
          setGuests((list) => applyQueue(mergeGuest(list, card), queueRef.current));
        },
      },
      (isLive) => {
        setLive(isLive);
        if (isLive && everLive) refreshList().then(flush);
        if (isLive) everLive = true;
      },
    );
    const onOnline = () => refreshList().then(flush);
    window.addEventListener("online", onOnline);
    const retry = setInterval(flush, 15_000);
    return () => {
      clearTimeout(boot);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      clearInterval(retry);
    };
  }, [client, event.id, flush, refreshList, setGuests]);

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim().toLowerCase();
      const find = () => guestsRef.current.find((g) => g.qr_token && g.qr_token === code);
      let guest = find();
      // Tamu yang baru ditambahkan host setelah daftar dimuat: ambil ulang sekali.
      if (!guest && navigator.onLine && QR_PATTERN.test(code)) {
        await refreshList();
        guest = find();
      }
      if (guest) {
        setSelected(guest);
        setNotice(null);
      } else {
        notify("warn", "QR tidak dikenal untuk acara ini. Cari nama tamu secara manual.");
      }
    },
    [notify, refreshList],
  );

  // Scanner USB/Bluetooth mengetik isi QR sangat cepat lalu Enter, di mana pun fokusnya.
  useEffect(() => {
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const now = Date.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 8) handleCode(buffer);
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCode]);

  function checkIn(guest: Guest, pax: number) {
    const at = new Date().toISOString();
    setQueue([...queueRef.current, { kind: "checkin", id: guest.id, name: guest.guest_name, pax, at }]);
    setGuests((list) => mergeGuest(list, { id: guest.id, checked_in_at: at, checked_in_pax: pax, checked_in_by: null }));
    setSelected(null);
    notify("ok", `${guest.guest_name} tercatat hadir, ${pax} orang${guest.table_number ? ` · Meja ${guest.table_number}` : ""}.`);
    flush();
  }

  function addWalkIn(name: string, pax: number) {
    const action: PendingAction = { kind: "walkin", id: crypto.randomUUID(), name, pax, at: new Date().toISOString() };
    setQueue([...queueRef.current, action]);
    setGuests((list) => applyQueue(list, [action]));
    notify("ok", `${name} ditambahkan dan tercatat hadir, ${pax} orang.`);
    flush();
  }

  const checkedIn = guests.filter((g) => g.checked_in_at);
  const people = checkedIn.reduce((sum, g) => sum + (g.checked_in_pax ?? 0), 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">
              Hadir {checkedIn.length} dari {guests.length} undangan · {people} orang
            </p>
          </div>
          <p className="flex shrink-0 items-center gap-2 text-xs" aria-live="polite">
            <span aria-hidden className={`size-2.5 rounded-full ${online && live ? "bg-emerald-500" : online ? "bg-amber-500" : "bg-red-500"}`} />
            {online && live ? "Tersambung" : online ? "Menyambung..." : "Offline"}
          </p>
        </div>
        <div role="tablist" aria-label="Menu penerima tamu" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["scan", "Scan QR"],
              ["search", "Cari nama"],
              ["recap", "Rekap"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`min-h-11 rounded-md px-2 text-sm font-medium ${view === key ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        {forbidden && (
          <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
            Akses staf perangkat ini sudah berakhir atau dicabut host. Check-in yang belum terkirim tetap tersimpan di perangkat ini.
          </p>
        )}
        {queue.length > 0 && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
            {queue.length} check-in belum terkirim{forbidden ? "." : online ? ", sedang dikirim..." : ". Dikirim otomatis saat sinyal kembali."}
          </p>
        )}
        {listState === "loading" && <p className="py-10 text-center text-sm text-muted-foreground">Memuat daftar tamu...</p>}
        {listState === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm">Daftar tamu gagal dimuat.</p>
            <Button type="button" variant="outline" className="h-11" onClick={() => refreshList()}>
              Coba lagi
            </Button>
          </div>
        )}

        {listState === "ready" && view === "scan" && (
          <>
            <QrCamera paused={selected !== null} onCode={handleCode} />
            <p className="text-sm text-muted-foreground">Punya scanner USB atau Bluetooth? Langsung scan QR tamu, tanpa perlu menekan apa pun.</p>
            <WalkInForm onAdd={addWalkIn} />
          </>
        )}
        {listState === "ready" && view === "search" && <GuestSearch guests={guests} time={time} onSelect={setSelected} onCode={handleCode} />}
        {listState === "ready" && view === "recap" && <Recap guests={guests} sessions={event.sessions} />}
      </main>

      {selected && (
        <GuestCard
          key={selected.id}
          guest={guests.find((g) => g.id === selected.id) ?? selected}
          sessions={event.sessions}
          time={time}
          onCheckIn={checkIn}
          onClose={() => setSelected(null)}
        />
      )}

      <p aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4">
        {notice && (
          <span className={`rounded-xl px-4 py-3 text-sm shadow-lg ${notice.tone === "ok" ? "bg-emerald-700 text-white" : "bg-amber-400 text-black"}`}>
            {notice.text}
          </span>
        )}
      </p>
    </div>
  );
}

function GuestCard({
  guest,
  sessions,
  time,
  onCheckIn,
  onClose,
}: {
  guest: Guest;
  sessions: StaffAccess["event"]["sessions"];
  time: (iso: string) => string;
  onCheckIn: (guest: Guest, pax: number) => void;
  onClose: () => void;
}) {
  const [pax, setPax] = useState(() => Math.min(MAX_PAX, Math.max(1, guest.rsvp_pax || guest.pax_allowed)));
  const invitedSessions = guest.session_ids.length ? sessions.filter((s) => guest.session_ids.includes(s.id)) : sessions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-card-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl bg-background p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="guest-card-title" className="text-2xl font-bold [overflow-wrap:anywhere]">
              {guest.guest_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {CATEGORY_LABEL[guest.category] ?? guest.category} · RSVP {RSVP_LABEL[guest.rsvp_status] ?? guest.rsvp_status}
              {guest.rsvp_status === "attending" && guest.rsvp_pax ? `, ${guest.rsvp_pax} orang` : ""}
            </p>
          </div>
          {guest.table_number && (
            <div className="shrink-0 rounded-xl bg-primary px-3 py-2 text-center text-primary-foreground">
              <p className="text-xs">Meja</p>
              <p className="text-2xl font-bold">{guest.table_number}</p>
            </div>
          )}
        </div>
        {sessions.length > 1 && <p className="text-sm">Diundang ke: {invitedSessions.map((s) => s.name).join(", ")}</p>}

        {guest.checked_in_at ? (
          <>
            <p className="rounded-lg bg-amber-400 px-3 py-2 font-medium text-black" role="alert">
              Sudah check-in pukul {time(guest.checked_in_at)}
              {guest.checked_in_by ? ` oleh ${guest.checked_in_by}` : ""}, {guest.checked_in_pax ?? 0} orang.
            </p>
            <Button type="button" variant="outline" className="h-12" onClick={onClose} autoFocus>
              Tutup
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span id="pax-label" className="text-sm font-medium">
                Jumlah orang datang
              </span>
              <div className="flex items-center gap-2" role="group" aria-labelledby="pax-label">
                <Button type="button" variant="outline" className="size-11 text-lg" onClick={() => setPax((n) => Math.max(1, n - 1))} aria-label="Kurangi">
                  −
                </Button>
                <span className="w-8 text-center text-2xl font-bold tabular-nums" aria-live="polite">
                  {pax}
                </span>
                <Button type="button" variant="outline" className="size-11 text-lg" onClick={() => setPax((n) => Math.min(MAX_PAX, n + 1))} aria-label="Tambah">
                  +
                </Button>
              </div>
            </div>
            {pax > guest.pax_allowed && <p className="text-sm text-amber-700 dark:text-amber-400">Melebihi jatah undangan ({guest.pax_allowed} orang).</p>}
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Button type="button" variant="outline" className="h-12" onClick={onClose}>
                Batal
              </Button>
              <Button type="button" className="h-12 text-base" onClick={() => onCheckIn(guest, pax)} autoFocus>
                Check-in {pax} orang
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GuestSearch({
  guests,
  time,
  onSelect,
  onCode,
}: {
  guests: Guest[];
  time: (iso: string) => string;
  onSelect: (guest: Guest) => void;
  onCode: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalizeName(query);
  const results = q ? guests.filter((g) => normalizeName(g.guest_name).includes(q)).slice(0, 30) : [];

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="guest-search">Nama tamu</Label>
      <Input
        id="guest-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Scanner USB yang mengetik ke kolom ini tetap diproses sebagai scan.
          if (e.key === "Enter" && QR_PATTERN.test(query.trim().toLowerCase())) {
            onCode(query);
            setQuery("");
          }
        }}
        placeholder="Ketik minimal sebagian nama"
        autoComplete="off"
        className="h-11"
        autoFocus
      />
      {q && results.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada tamu bernama &ldquo;{query}&rdquo;. Tambahkan sebagai tamu tidak terdaftar di tab Scan QR.</p>}
      <ul className="flex flex-col divide-y rounded-xl border">
        {results.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => onSelect(g)} className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left">
              <span className="min-w-0">
                <span className="block truncate font-medium">{g.guest_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {CATEGORY_LABEL[g.category] ?? g.category}
                  {g.table_number ? ` · Meja ${g.table_number}` : ""}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-medium ${g.checked_in_at ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {g.checked_in_at ? `Hadir ${time(g.checked_in_at)}` : "Belum hadir"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WalkInForm({ onAdd }: { onAdd: (name: string, pax: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pax, setPax] = useState(1);

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Tamu tidak terdaftar
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name.trim(), pax);
        setName("");
        setPax(1);
        setOpen(false);
      }}
    >
      <p className="font-semibold">Tamu tidak terdaftar</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="walkin-name">Nama</Label>
        <Input id="walkin-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="h-11" autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="walkin-pax">Jumlah orang</Label>
        <Input id="walkin-pax" type="number" min={1} max={MAX_PAX} value={pax} onChange={(e) => setPax(Math.min(MAX_PAX, Math.max(1, Number(e.target.value) || 1)))} className="h-11" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
          Batal
        </Button>
        <Button type="submit" className="h-11" disabled={!name.trim()}>
          Tambah dan check-in
        </Button>
      </div>
    </form>
  );
}

function Recap({ guests, sessions }: { guests: Guest[]; sessions: StaffAccess["event"]["sessions"] }) {
  const row = (label: string, list: Guest[]) => {
    const present = list.filter((g) => g.checked_in_at);
    const percent = list.length ? Math.round((present.length / list.length) * 100) : 0;
    return (
      <li key={label} className="flex flex-col gap-1.5 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{label}</span>
          <span className="text-sm tabular-nums">
            {present.length}/{list.length} undangan · {present.reduce((s, g) => s + (g.checked_in_pax ?? 0), 0)} orang
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${percent} persen hadir`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Keseluruhan</h2>
        <ul className="rounded-xl border">{row("Semua tamu", guests)}</ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Per kategori</h2>
        <ul className="divide-y rounded-xl border">
          {Object.entries(CATEGORY_LABEL).map(([key, label]) => row(label, guests.filter((g) => g.category === key)))}
        </ul>
      </section>
      {sessions.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Per sesi</h2>
          <ul className="divide-y rounded-xl border">
            {sessions.map((s) => row(s.name, guests.filter((g) => !g.session_ids.length || g.session_ids.includes(s.id))))}
          </ul>
        </section>
      )}
    </div>
  );
}
