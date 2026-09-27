import "server-only";
import * as Sentry from "@sentry/nextjs";

// Untuk error yang sudah ditangani (tidak dilempar) tetapi tetap perlu diketahui tim, misalnya pembayaran yang
// lunas tetapi paketnya gagal dipasang. Tetap ditulis ke log server; ke Sentry hanya bila DSN diisi.
// `context` jangan berisi data pribadi (nama tamu, email, nomor HP); cukup ID.
export function reportError(message: string, error?: unknown, context?: Record<string, string | number | boolean | null | undefined>) {
  console.error(message, error ?? "");
  Sentry.withScope((scope) => {
    if (context) scope.setContext("detail", context);
    if (error instanceof Error) {
      scope.setExtra("message", message);
      Sentry.captureException(error);
    } else {
      if (error !== undefined) scope.setExtra("error", String(error));
      Sentry.captureMessage(message, "error");
    }
  });
}
