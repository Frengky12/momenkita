import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { safeNextPath } from "@/lib/safe-next";
import { getAuthProviders } from "@/lib/supabase/auth-providers";
import { LoginForm } from "./login-form";

const CALLBACK_ERRORS: Record<string, string> = {
  link: "Link masuk tidak valid atau sudah kedaluwarsa. Minta link baru di bawah.",
  google: "Masuk dengan Google gagal. Coba lagi, atau pakai email.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(typeof searchParams.next === "string" ? searchParams.next : null);
  const errorKey = typeof searchParams.error === "string" ? searchParams.error : null;
  const callbackError = errorKey ? (CALLBACK_ERRORS[errorKey] ?? CALLBACK_ERRORS.link) : null;
  const { google } = await getAuthProviders();

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* Satu glow dari referensi, menjadi titik fokus di belakang kartu masuk. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 h-72 w-[min(90%,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-md">
          <Wordmark />
        </Link>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold">Masuk ke dashboard</h1>
            </CardTitle>
            <CardDescription>Kami kirim link masuk ke email kamu, jadi tidak perlu password.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {callbackError && (
              <Alert variant="destructive">
                <AlertDescription>{callbackError}</AlertDescription>
              </Alert>
            )}
            <LoginForm next={next} googleEnabled={google} />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Baru pertama kali? Masukkan email kamu, akun dibuat otomatis.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Dengan masuk, kamu menyetujui{" "}
          <Link href="/legal/syarat" className="underline underline-offset-4">
            Syarat &amp; Ketentuan
          </Link>{" "}
          dan{" "}
          <Link href="/legal/privasi" className="underline underline-offset-4">
            Kebijakan Privasi
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
