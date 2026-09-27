import { icsFile } from "@/lib/invitation/links";
import { loadPublicInvitation } from "@/lib/invitation/load";

export async function GET(request: Request, ctx: RouteContext<"/[slug]/kalender/[sessionId]">) {
  const { slug, sessionId } = await ctx.params;
  const data = await loadPublicInvitation(slug);
  const session = data?.sessions.find((s) => s.id === sessionId);
  if (!data || !session) return new Response("Tidak ditemukan", { status: 404 });

  const invitationUrl = new URL(`/${slug}`, request.url).toString();
  return new Response(icsFile(session, data.event.title, invitationUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${session.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics"`,
    },
  });
}
