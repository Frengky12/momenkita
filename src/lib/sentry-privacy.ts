// Hanya import tipe: modul ini ikut ke bundle browser, SDK-nya tidak boleh ikut.
import type { Breadcrumb, ErrorEvent, init } from "@sentry/nextjs";

type DataCollection = NonNullable<Parameters<typeof init>[0]>["dataCollection"];

// Opsi privasi bersama server dan browser (PRD §9.1). SDK v11 secara default mengumpulkan cookie, header, body
// request, query string, dan info user; semuanya dimatikan karena bisa memuat nama/nomor HP tamu atau token.
export const dataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

// Path yang memuat data pribadi atau rahasia: slug pribadi tamu (berisi nama) dan token undangan co-host.
export function scrubUrl(url: string) {
  return url.replace(/\/to\/[^/?#]+/g, "/to/[tamu]").replace(/\/gabung\/[^/?#]+/g, "/gabung/[token]").replace(/[?#].*$/, "");
}

export function beforeSend(event: ErrorEvent) {
  if (event.request?.url) event.request.url = scrubUrl(event.request.url);
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  return event;
}

export function beforeBreadcrumb(breadcrumb: Breadcrumb) {
  if (breadcrumb.data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof breadcrumb.data[key] === "string") breadcrumb.data[key] = scrubUrl(breadcrumb.data[key]);
    }
  }
  return breadcrumb;
}
