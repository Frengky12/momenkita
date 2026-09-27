import type { Metadata } from "next";
import { Wordmark } from "@/components/wordmark";
import { StaffLogin } from "./staff-login";

export const metadata: Metadata = { title: "Masuk Staf", robots: { index: false, follow: false } };

// Link staf berformat /staff#<token>: token di fragmen URL tidak ikut terkirim ke server maupun log akses.
export default function StaffPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Wordmark />
        <div className="rounded-xl border bg-card p-6">
          <StaffLogin />
        </div>
      </div>
    </main>
  );
}
