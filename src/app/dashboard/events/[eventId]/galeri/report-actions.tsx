"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveReport } from "./actions";

export function ReportActions({ eventId, reportId, photoId, photoLive }: { eventId: string; reportId: string; photoId: string; photoLive: boolean }) {
  const [pending, setPending] = useState<"remove" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "remove" | "dismiss") {
    if (kind === "remove" && !window.confirm("Turunkan foto ini? Foto hilang dari layar panggung, galeri, dan unduhan ZIP.")) return;
    setPending(kind);
    setError(null);
    const result = await resolveReport(eventId, reportId, kind === "remove" ? photoId : null);
    if (result.status === "error") setError(result.message);
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {photoLive && (
          <Button type="button" variant="destructive" className="h-11" disabled={pending !== null} onClick={() => run("remove")}>
            {pending === "remove" ? "Menurunkan..." : "Turunkan foto"}
          </Button>
        )}
        <Button type="button" variant="outline" className="h-11" disabled={pending !== null} onClick={() => run("dismiss")}>
          {pending === "dismiss" ? "Menyimpan..." : photoLive ? "Abaikan" : "Tandai selesai"}
        </Button>
      </div>
      {error && (
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
