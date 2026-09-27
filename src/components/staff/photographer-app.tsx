"use client";

import { useCallback, useEffect, useState } from "react";
import { ZipDownload } from "@/components/gallery/zip-download";
import { StaffGate } from "@/components/staff/staff-gate";
import { Button } from "@/components/ui/button";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { fetchStaffPhotos, type StaffAccess, type StaffPhoto } from "@/lib/staff/access";

const PREVIEW_LIMIT = 120;

type Summary = { package: string | null; downloadable: number; locked: number; originals: number };

export function PhotographerPage({ eventId }: { eventId: string }) {
  return <StaffGate eventId={eventId} role="photographer">{(access) => <Photographer access={access} />}</StaffGate>;
}

function Photographer({ access }: { access: StaffAccess }) {
  const { client, event } = access;
  const [first, second] = coupleNames(parseContent(event.theme_config));
  const title = first.nickname && second.nickname ? `${first.nickname} & ${second.nickname}` : event.title;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [photos, setPhotos] = useState<StaffPhoto[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const [{ data, error }, result] = await Promise.all([
        client.rpc("staff_gallery_summary", { p_event_id: event.id }),
        // Fotografer hanya menerima foto approved yang tidak terkunci kuota (RPC staff_photos).
        fetchStaffPhotos(client, event.id, { variants: "thumb", limit: PREVIEW_LIMIT }),
      ]);
      if (error) throw error;
      setSummary(data as unknown as Summary);
      setPhotos(result.photos.filter((p) => p.status === "approved" && !p.over_quota));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [client, event.id]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">Unduh foto tamu yang sudah disetujui untuk materi album.</p>
      </header>

      {state === "loading" && <p className="py-10 text-center text-sm text-muted-foreground">Memuat foto...</p>}
      {state === "error" && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm">Foto gagal dimuat. Periksa koneksi internet perangkat ini.</p>
          <Button type="button" variant="outline" className="h-11" onClick={load}>
            Coba lagi
          </Button>
        </div>
      )}

      {state === "ready" && summary && (
        <>
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="unduh">
            <h2 id="unduh" className="font-semibold">
              Unduh semua foto
            </h2>
            <ZipDownload
              client={client}
              eventId={event.id}
              slug={event.slug}
              timezone={event.timezone}
              total={summary.downloadable}
              allowOriginal={summary.package === "luxury" && summary.originals > 0}
            />
          </section>

          {photos.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="pratinjau">
              <h2 id="pratinjau" className="font-semibold">
                {summary.downloadable > photos.length ? `${photos.length} foto terbaru` : "Semua foto"}
              </h2>
              <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-6">
                {photos.map((photo) => (
                  <li key={photo.id} className="aspect-square overflow-hidden rounded-md bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 */}
                    {photo.thumb_url && <img src={photo.thumb_url} alt={photo.caption ?? `Foto dari ${photo.uploader_name}`} loading="lazy" className="size-full object-cover" />}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada foto yang disetujui.</p>
          )}
        </>
      )}
    </div>
  );
}
