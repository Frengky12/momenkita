"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function EventTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/dashboard/events/${eventId}/undangan`, label: "Undangan" },
    { href: `/dashboard/events/${eventId}/tamu`, label: "Tamu" },
    { href: `/dashboard/events/${eventId}/pratinjau`, label: "Pratinjau" },
    { href: `/dashboard/events/${eventId}/publikasi`, label: "Publikasi" },
    { href: `/dashboard/events/${eventId}/hari-h`, label: "Hari-H" },
    { href: `/dashboard/events/${eventId}/galeri`, label: "Galeri" },
  ];

  return (
    <nav aria-label="Bagian event" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b print:hidden">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
