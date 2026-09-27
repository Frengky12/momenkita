-- Admin menutup laporan yang ternyata tidak melanggar, tanpa menurunkan fotonya.
alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check check (action in (
  'activate_event', 'record_refund', 'reconcile_order', 'takedown_photo', 'dismiss_report', 'adjust_credit', 'upsert_domain', 'set_domain_status'
));

create function public.admin_dismiss_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.photo_reports%rowtype;
begin
  perform public.require_admin();
  update public.photo_reports set resolved_at = now()
  where id = p_report_id and resolved_at is null
  returning * into v_report;
  if not found then
    raise exception 'laporan tidak ditemukan atau sudah ditutup' using errcode = 'P0002';
  end if;
  perform public.log_admin_action('dismiss_report', p_reason, p_event_id => v_report.event_id, p_photo_id => v_report.photo_id,
    p_details => jsonb_build_object('report_id', v_report.id, 'report_reason', v_report.reason));
end;
$$;

revoke execute on function public.admin_dismiss_report(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_dismiss_report(uuid, text) to authenticated;
