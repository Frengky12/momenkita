// MVP: host mengirim sendiri dari HP-nya lewat wa.me (PRD §9.3), tanpa WhatsApp API sehingga nomor tidak berisiko diblokir.
export function whatsappMessage(template: string, values: { nama: string; link: string; mempelai: string }) {
  return template.replaceAll("{nama}", values.nama).replaceAll("{link}", values.link).replaceAll("{mempelai}", values.mempelai);
}

export function whatsappUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
