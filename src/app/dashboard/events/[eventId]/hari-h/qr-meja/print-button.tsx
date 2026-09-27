"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" className="h-11" onClick={() => window.print()}>
      Cetak
    </Button>
  );
}
