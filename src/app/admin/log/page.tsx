import { AuditList } from "../audit-list";
import { requireAdmin } from "../guard";

export default async function AdminLogPage() {
  await requireAdmin();
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log admin</h1>
        <p className="text-sm text-muted-foreground">Semua tindakan Super Admin beserta alasannya, 100 terbaru. Log tidak bisa diubah atau dihapus dari aplikasi.</p>
      </div>
      <AuditList title="Tindakan terbaru" limit={100} />
    </>
  );
}
