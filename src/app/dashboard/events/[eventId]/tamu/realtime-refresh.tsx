"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// RSVP dan check-in dari tamu memicu broadcast "invitation" (trigger database); halaman memuat ulang datanya.
export function RealtimeRefresh({ eventId }: { eventId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    (async () => {
      // Channel privat butuh token sesi host; tanpa setAuth, join ditolak.
      await supabase.realtime.setAuth();
      channel = supabase
        .channel(`event:${eventId}`, { config: { private: true } })
        .on("broadcast", { event: "invitation" }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 300);
        })
        .subscribe();
    })();

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  return null;
}
