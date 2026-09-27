import { Cormorant_Garamond } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { coupleNames, parseContent } from "@/lib/invitation/content";
import { requestOrigin } from "@/lib/invitation/origin";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], style: ["normal", "italic"], variable: "--font-cormorant" });

const CARDS_PER_SHEET = 4;

// Empat kartu seukuran A6 per lembar A4; dashboard lain disembunyikan saat dicetak (print:hidden di layout).
export default async function TableQrPage({ params }: PageProps<"/dashboard/events/[eventId]/hari-h/qr-meja">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug, theme_config").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const [first, second] = coupleNames(parseContent(event.theme_config));
  const couple = first.nickname && second.nickname ? `${first.nickname} & ${second.nickname}` : "";
  const cameraUrl = `${await requestOrigin()}/${event.slug}/kamera`;

  return (
    <div className={`${display.variable} flex flex-col gap-6`}>
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <div className="flex flex-col gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          Satu lembar A4 berisi {CARDS_PER_SHEET} kartu. Cetak sebanyak jumlah meja dibagi {CARDS_PER_SHEET}, potong mengikuti garis putus-putus, lalu letakkan di tiap meja.
        </p>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Button asChild variant="outline" className="h-11">
            <Link href={`/dashboard/events/${event.id}/hari-h`}>Kembali</Link>
          </Button>
        </div>
      </div>

      <div className="theme-klasik grid grid-cols-2 border border-dashed border-(--inv-line) text-(--inv-text) print:border-neutral-400">
        {Array.from({ length: CARDS_PER_SHEET }, (_, i) => (
          <div
            key={i}
            className="flex aspect-[105/148] flex-col items-center justify-center gap-[4%] border border-dashed border-(--inv-line) bg-white p-[7%] text-center print:border-neutral-400"
          >
            <p className="font-display text-[clamp(12px,2.4vw,17px)] text-(--inv-accent) italic print:text-[13pt]">Bagikan momenmu</p>
            {couple && <p className="font-display text-[clamp(18px,4.2vw,30px)] leading-tight font-semibold print:text-[22pt]">{couple}</p>}
            <QrCode value={cameraUrl} label="QR kamera tamu" className="w-[62%]" />
            <p className="text-[clamp(10px,2vw,14px)] font-semibold print:text-[11pt]">Scan dengan kamera HP</p>
            <p className="text-[clamp(8px,1.6vw,12px)] text-(--inv-muted) print:text-[8pt]">
              Foto kamu bisa tampil di layar panggung. Tanpa aplikasi, tanpa daftar.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
