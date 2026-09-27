"use client";

import { Field } from "@/components/dashboard/field";
import { SectionForm } from "@/components/dashboard/section-form";
import { Input } from "@/components/ui/input";
import { saveGallerySettings } from "./actions";

export function GallerySettings({ eventId, isPublic, hasPasscode }: { eventId: string; isPublic: boolean; hasPasscode: boolean }) {
  return (
    <SectionForm action={saveGallerySettings.bind(null, eventId)}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" name="public" defaultChecked={isPublic} className="mt-1 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-medium">Buka galeri untuk tamu</span>
          <span className="block text-sm text-muted-foreground">Tamu yang punya link bisa melihat foto yang disetujui. Foto di atas kuota tidak ikut tampil.</span>
        </span>
      </label>
      <Field
        label={hasPasscode ? "Ganti passcode" : "Passcode (opsional)"}
        htmlFor="gallery-passcode"
        hint={hasPasscode ? "Passcode aktif. Isi untuk mengganti; tamu perlu memasukkan passcode baru." : "Kosongkan bila galeri boleh dilihat siapa pun yang punya link. 4 sampai 32 karakter."}
      >
        <Input id="gallery-passcode" name="passcode" type="text" autoComplete="off" maxLength={32} className="h-11 max-w-xs" />
      </Field>
      {hasPasscode && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="removePasscode" className="size-4 accent-primary" />
          Hapus passcode
        </label>
      )}
    </SectionForm>
  );
}
