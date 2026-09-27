import Link from "next/link";
import { SectionForm } from "@/components/dashboard/section-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite, switchAccount } from "./actions";

type Preview = {
  status: "valid" | "owner" | "member" | "used" | "revoked" | "expired" | "invalid";
  event_id?: string;
  event_title?: string;
  owner_name?: string | null;
  owner_email?: string;
};

// Halaman ini di bawah /dashboard, jadi proxy sudah mengarahkan tamu yang belum login ke /login?next=<link ini>.
export default async function JoinPage({ params }: PageProps<"/dashboard/gabung/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: claims }, { data }] = await Promise.all([
    supabase.auth.getClaims(),
    token.length <= 100 ? supabase.rpc("cohost_invite_preview", { p_token: token }) : Promise.resolve({ data: { status: "invalid" } }),
  ]);
  const preview = (data ?? { status: "invalid" }) as Preview;
  const owner = preview.owner_name || preview.owner_email;
  const title = preview.event_title;

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
      {preview.status === "valid" && (
        <>
          <h1 className="text-xl font-semibold">Undangan jadi co-host</h1>
          <p>
            {owner} mengundang kamu ikut mengelola undangan <span className="font-semibold">{title}</span> di MomenKita.
          </p>
          <p className="text-sm text-muted-foreground">
            Co-host bisa mengubah undangan, mengelola tamu, menyiapkan hari-H, dan membuka galeri. Kamu masuk sebagai{" "}
            <span className="font-medium text-foreground [overflow-wrap:anywhere]">{claims?.claims.email}</span>.
          </p>
          <SectionForm action={acceptInvite.bind(null, token)} submitLabel="Terima undangan" pendingLabel="Menerima..." />
          <form action={switchAccount.bind(null, token)}>
            <Button type="submit" variant="link" className="h-11 px-0">
              Bukan akun ini? Masuk dengan email lain
            </Button>
          </form>
        </>
      )}

      {preview.status === "member" && (
        <Message title="Kamu sudah jadi co-host" body={`Event ${title} sudah ada di dashboard kamu.`}>
          <EventButton eventId={preview.event_id} />
        </Message>
      )}
      {preview.status === "owner" && (
        <Message title="Ini undangan untuk event milikmu" body="Kirim link ini ke orang yang ingin kamu jadikan co-host. Mereka membukanya dengan akun masing-masing.">
          <EventButton eventId={preview.event_id} path="pengelola" label="Buka pengelola event" />
        </Message>
      )}
      {preview.status === "used" && <Message title="Undangan sudah dipakai" body={`Link ini hanya bisa dipakai sekali. Minta link baru ke ${owner}.`} />}
      {preview.status === "revoked" && <Message title="Undangan sudah dicabut" body={`Pemilik event membatalkan link ini. Hubungi ${owner} kalau kamu memang perlu akses.`} />}
      {preview.status === "expired" && <Message title="Undangan sudah kedaluwarsa" body={`Link undangan berlaku 7 hari. Minta link baru ke ${owner}.`} />}
      {preview.status === "invalid" && (
        <Message title="Link undangan tidak dikenal" body="Pastikan link disalin utuh dari pesan pemilik event, tanpa terpotong." />
      )}
    </section>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children ?? (
        <Button asChild variant="outline" className="h-11 w-fit">
          <Link href="/dashboard">Ke dashboard</Link>
        </Button>
      )}
    </>
  );
}

function EventButton({ eventId, path = "undangan", label = "Buka event" }: { eventId?: string; path?: string; label?: string }) {
  return (
    <Button asChild className="h-11 w-fit">
      <Link href={`/dashboard/events/${eventId}/${path}`}>{label}</Link>
    </Button>
  );
}
