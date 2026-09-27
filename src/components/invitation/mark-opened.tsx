"use client";

import { useEffect } from "react";
import { markOpened } from "@/app/[slug]/actions";

// Sekali per sesi browser, supaya membuka ulang undangan tidak memanggil server berulang kali.
export function MarkOpened({ slug, personalSlug }: { slug: string; personalSlug: string }) {
  useEffect(() => {
    const key = `momenkita-opened:${slug}/${personalSlug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage bisa diblokir (mode privat); tetap catat sekali.
    }
    markOpened(slug, personalSlug);
  }, [slug, personalSlug]);

  return null;
}
