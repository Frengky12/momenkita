export type StaffRole = "moderator" | "receptionist" | "stage" | "photographer";

// path = halaman di /staff/<eventId>/<path> yang dibuka setelah PIN benar.
export const STAFF_ROLES: Record<StaffRole, { label: string; path: string; description: string }> = {
  moderator: { label: "Moderator", path: "moderasi", description: "Menyetujui foto tamu dan mem-blackout layar dari HP." },
  receptionist: { label: "Penerima tamu", path: "scanner", description: "Scan QR undangan dan mencatat kehadiran." },
  stage: { label: "Layar panggung", path: "panggung", description: "Slideshow foto di laptop yang tersambung ke proyektor atau LED." },
  photographer: { label: "Fotografer", path: "foto", description: "Mengunduh foto tamu yang sudah disetujui." },
};

export const CREATABLE_ROLES = ["moderator", "receptionist", "stage", "photographer"] as const satisfies readonly StaffRole[];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && value in STAFF_ROLES;
}
