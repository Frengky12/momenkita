"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Hari ini" },
  { href: "/admin/cari", label: "Cari" },
  { href: "/admin/laporan", label: "Laporan" },
  { href: "/admin/domain", label: "Domain" },
  { href: "/admin/log", label: "Log" },
];

export function AdminNav() {
  const pathname = usePathname();
  // Detail event dan pengguna dibuka dari pencarian, jadi tab Cari tetap aktif di sana.
  const current = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(href) || (href === "/admin/cari" && /^\/admin\/(events|pengguna)\//.test(pathname));

  return (
    <nav aria-label="Menu Super Admin" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
      {TABS.map((tab) => {
        const active = current(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
