export type SessionLike = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  venue_address: string | null;
};

function place(session: SessionLike) {
  return [session.venue_name, session.venue_address].filter(Boolean).join(", ");
}

// Berbasis teks alamat, jadi host tidak perlu mengisi koordinat.
export function mapsUrl(session: SessionLike) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place(session))}`;
}

export function wazeUrl(session: SessionLike) {
  return `https://waze.com/ul?q=${encodeURIComponent(place(session))}&navigate=yes`;
}

// Format tanggal kalender: 20261212T040000Z (UTC).
function calendarStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(session: SessionLike, title: string, invitationUrl: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${session.name} ${title}`,
    dates: `${calendarStamp(session.starts_at)}/${calendarStamp(session.ends_at)}`,
    details: `Undangan: ${invitationUrl}`,
    location: place(session),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsFile(session: SessionLike, title: string, invitationUrl: string) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MomenKita//Undangan//ID",
    "BEGIN:VEVENT",
    `UID:${session.id}@momenkita`,
    `DTSTAMP:${calendarStamp(new Date().toISOString())}`,
    `DTSTART:${calendarStamp(session.starts_at)}`,
    `DTEND:${calendarStamp(session.ends_at)}`,
    `SUMMARY:${escapeIcs(`${session.name} ${title}`)}`,
    `LOCATION:${escapeIcs(place(session))}`,
    `DESCRIPTION:${escapeIcs(`Undangan: ${invitationUrl}`)}`,
    `URL:${invitationUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
