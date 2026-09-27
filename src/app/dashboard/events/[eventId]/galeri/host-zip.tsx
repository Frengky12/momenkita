"use client";

import { useState } from "react";
import { ZipDownload } from "@/components/gallery/zip-download";
import { createClient } from "@/lib/supabase/client";

// Host memakai sesi cookie-nya sendiri sebagai token Bearer untuk API manifest unduhan.
export function HostZip(props: { eventId: string; slug: string; timezone: string; total: number; allowOriginal: boolean }) {
  const [client] = useState(() => createClient());
  return <ZipDownload client={client} {...props} />;
}
