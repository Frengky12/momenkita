import { THEMES, type CoverStyle, type ThemeId } from "@/lib/invitation/content";

// Event contoh yang ditautkan dari halaman depan. Hanya di event ini tema dan sampul bisa diganti lewat URL
// (?tema=adat&sampul=penuh), dan form RSVP tidak menyimpan apa pun.
export const DEMO_SLUGS = new Set(["contoh-botani"]);

export type DemoView = { theme: ThemeId; coverStyle: CoverStyle };

const COVER_PARAM: Record<string, CoverStyle> = { bingkai: "frame", penuh: "full" };
export const COVER_PARAM_OF: Record<CoverStyle, string> = { frame: "bingkai", full: "penuh" };

export function demoView(searchParams: Record<string, string | string[] | undefined>, fallback: DemoView): DemoView {
  const tema = searchParams.tema;
  const sampul = searchParams.sampul;
  return {
    theme: typeof tema === "string" && tema in THEMES ? (tema as ThemeId) : fallback.theme,
    coverStyle: typeof sampul === "string" && sampul in COVER_PARAM ? COVER_PARAM[sampul] : fallback.coverStyle,
  };
}
