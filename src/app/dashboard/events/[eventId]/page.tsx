import { redirect } from "next/navigation";

export default async function EventPage({ params }: PageProps<"/dashboard/events/[eventId]">) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/undangan`);
}
