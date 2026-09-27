// Uji end-to-end Super Admin (Minggu 7): gerbang /admin, monitor admin_today dari sesi admin (upload ditolak,
// detak panggung, laporan), dan custom domain lewat proxy. Butuh dev server dan .env.local.
// KEEP=1 menyisakan data uji untuk QA manual di browser; data sisa dibersihkan otomatis di awal run berikutnya.
import fs from 'node:fs';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const KEEP = process.env.KEEP === '1';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const newClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + detail}`); };
const post = async (p, body, headers = {}) => {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
// fetch tidak bisa mengganti header Host; custom domain diuji dengan http.request langsung ke dev server.
const viaHost = (host, p) => new Promise((resolve, reject) => {
  const url = new URL(p, BASE);
  const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, headers: { host } }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.end();
});

const ADMIN_EMAIL = 'uji-admin@momenkita.test';
const HOST_EMAIL = 'uji-admin-host@momenkita.test';
const slug = 'uji-admin';
const DOMAIN = 'uji-admin.test';

async function cleanup() {
  const { data: events } = await admin.from('events').select('id').eq('slug', slug);
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  for (const { id } of events ?? []) {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `events/${id}/` }));
    for (const o of list.Contents ?? []) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: o.Key }));
    // Log audit merujuk event lewat foreign key; baris log uji ikut dihapus bersama event-nya.
    await admin.from('admin_actions').delete().eq('event_id', id);
    await admin.from('custom_domains').delete().eq('event_id', id);
    // Order memakai on delete set null; tanpa dihapus eksplisit, order uji tertinggal tanpa event (dan provider_ref-nya bentrok di run berikutnya).
    await admin.from('orders').delete().eq('event_id', id);
    await admin.from('events').delete().eq('id', id);
  }
  // Organisasi uji dibuat manual saat QA penyesuaian kredit di browser.
  const { data: orgs } = await admin.from('organizations').select('id').eq('slug', 'wo-uji-admin');
  for (const { id } of orgs ?? []) {
    await admin.from('admin_actions').delete().eq('organization_id', id);
    await admin.from('credit_ledger').delete().eq('organization_id', id);
    await admin.from('organizations').delete().eq('id', id);
  }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users.users.filter((u) => [ADMIN_EMAIL, HOST_EMAIL].includes(u.email) || (u.is_anonymous && u.user_metadata?.uji === slug))) {
    await admin.from('admin_actions').delete().eq('actor_id', u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  return events?.length ?? 0;
}

async function signIn(email) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = newClient();
  await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  return { id: u.user.id, client };
}

// Cookie sesi persis seperti yang dipasang aplikasi di browser, agar halaman server bisa diuji per peran.
async function sessionCookie(client) {
  const { data: { session } } = await client.auth.getSession();
  let jar = [];
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => jar, setAll: (cookies) => { jar = cookies; } },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return jar.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function uploadPhoto(name, color, caption) {
  const s = await post(`/api/events/${slug}/guest-sessions`, { displayName: name, consentVersion: 'v1' });
  const images = {
    display: await sharp({ create: { width: 1200, height: 800, channels: 3, background: color } }).webp().toBuffer(),
    thumb: await sharp({ create: { width: 480, height: 320, channels: 3, background: color } }).webp().toBuffer(),
  };
  const files = Object.entries(images).map(([variant, buf]) => ({ variant, contentType: 'image/webp', size: buf.length }));
  const pre = await post('/api/uploads/presign', { files }, { authorization: `Bearer ${s.body.token}` });
  for (const u of pre.body.uploads) await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: images[u.variant] });
  const c = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1200, height: 800, caption }, { authorization: `Bearer ${s.body.token}` });
  return { id: c.body.photo.id, token: s.body.token };
}

try {
  const leftovers = await cleanup();
  if (leftovers) console.log(`  (data uji lama dibersihkan: ${leftovers} event)`);

  const adminUser = await signIn(ADMIN_EMAIL);
  await admin.from('profiles').update({ role: 'admin' }).eq('id', adminUser.id);
  const host = await signIn(HOST_EMAIL);

  const now = Date.now();
  const { data: ev, error: evError } = await admin.from('events')
    .insert({ owner_id: host.id, slug, title: 'Uji Super Admin', status: 'active', package: 'luxury', photo_quota: 1000, published_at: new Date(now).toISOString(), gallery_public: true })
    .select('id').single();
  if (evError) throw evError;
  const eventId = ev.id;
  await admin.from('event_sessions').insert({ event_id: eventId, name: 'Resepsi', starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 3 * 3600e3).toISOString() });
  const { data: invs } = await admin.from('invitations').insert([
    { event_id: eventId, guest_name: 'Bapak Rudi', category: 'vip', pax_allowed: 2 },
    { event_id: eventId, guest_name: 'Ibu Sari', category: 'regular', pax_allowed: 1 },
  ]).select('id, personal_slug');
  await admin.from('invitations').update({ checked_in_at: new Date().toISOString(), checked_in_pax: 2 }).eq('id', invs[0].id);
  const { error: orderError } = await admin.from('orders').insert([
    { profile_id: host.id, event_id: eventId, item_code: 'luxury', amount_idr: 699000, status: 'paid', paid_at: new Date().toISOString(), provider_ref: 'uji-admin-tx' },
    { profile_id: host.id, event_id: eventId, item_code: 'luxury', amount_idr: 699000, status: 'pending' },
  ]);
  if (orderError) throw orderError;

  console.log('# admin gate');
  const gate = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  check('/admin without session -> redirect to login', [303, 307, 308].includes(gate.status) && gate.headers.get('location')?.includes('/login?next=%2Fadmin'), `${gate.status} ${gate.headers.get('location')}`);
  // Layout dan page dirender paralel oleh Next.js; tiap page wajib memanggil guard sendiri agar isinya tidak ikut terkirim di respons 404.
  const hostCookie = await sessionCookie(host.client);
  const adminCookie = await sessionCookie(adminUser.client);
  const routes = ['/admin', '/admin/cari?q=uji', '/admin/laporan', '/admin/domain', '/admin/log', `/admin/events/${eventId}`, `/admin/pengguna/${host.id}`];
  const leaks = [];
  for (const route of routes) {
    const res = await fetch(BASE + route, { headers: { cookie: hostCookie }, redirect: 'manual' });
    const html = await res.text();
    if (res.status !== 404 || /Super Admin|Uji Super Admin|Acara hari ini|Laporan foto|Log admin|Aktivasi manual|Kredit organisasi/.test(html)) leaks.push(`${route} ${res.status}`);
  }
  check('host gets a bare 404 on every admin route (no page content)', leaks.length === 0, leaks.join(', '));
  const adminPages = await Promise.all(routes.map(async (route) => (await fetch(BASE + route, { headers: { cookie: adminCookie } })).status));
  check('admin opens every admin route', adminPages.every((s) => s === 200), adminPages.join(','));
  const { error: hostToday } = await host.client.rpc('admin_today');
  check('host (non-admin) cannot read admin_today', hostToday?.code === '42501', JSON.stringify(hostToday));

  console.log('# monitor data');
  const p1 = await uploadPhoto('Rina', { r: 196, g: 120, b: 92 }, 'Foto untuk dilaporkan');
  const p2 = await uploadPhoto('Joko', { r: 90, g: 130, b: 110 }, null);
  await host.client.rpc('staff_moderate_photo', { p_photo_id: p1.id, p_action: 'approve' });
  const report = await post(`/api/events/${slug}/gallery/report`, { photoId: p1.id, reason: 'privacy' });
  check('guest reports approved photo', report.status === 200, JSON.stringify(report.body));

  const rejected = await post('/api/uploads/presign', { files: [{ variant: 'display', contentType: 'image/webp', size: 999_999_999 }, { variant: 'thumb', contentType: 'image/webp', size: 400 }] }, { authorization: `Bearer ${p2.token}` });
  check('oversized upload rejected', rejected.status === 400, `${rejected.status} ${JSON.stringify(rejected.body)}`);
  let logged = 0;
  for (let i = 0; i < 20 && !logged; i++) {
    await new Promise((r) => setTimeout(r, 250));
    ({ count: logged } = await admin.from('upload_errors').select('id', { count: 'exact', head: true }).eq('event_id', eventId));
  }
  const { data: errRow } = await admin.from('upload_errors').select('stage, code').eq('event_id', eventId).maybeSingle();
  check('rejection recorded in upload_errors (after response)', errRow?.stage === 'presign' && errRow?.code === 'invalid_files', JSON.stringify(errRow));

  const { data: stageLink } = await host.client.rpc('create_staff_link', { p_event_id: eventId, p_role: 'stage', p_label: 'Uji panggung' });
  const stage = newClient();
  await stage.auth.signInAnonymously({ options: { data: { uji: slug } } });
  await stage.rpc('claim_staff_link', { p_token: stageLink.token, p_pin: stageLink.pin });
  const { error: beatError } = await stage.rpc('staff_stage_heartbeat', { p_event_id: eventId, p_realtime_live: true, p_cached_photos: 12 });
  check('stage heartbeat accepted', !beatError, JSON.stringify(beatError));

  const { data: today, error: todayError } = await adminUser.client.rpc('admin_today');
  const row = today?.find((r) => r.event_id === eventId);
  check('admin_today lists the event', !todayError && !!row, JSON.stringify(todayError));
  check('monitor counts photos, pending, check-in, reports', row?.photos_today === 2 && row?.pending === 1 && row?.checked_in === 1 && row?.invitations === 2 && row?.open_reports === 1, JSON.stringify(row));
  check('monitor counts upload rejections', row?.upload_errors_today === 1, String(row?.upload_errors_today));
  check('monitor shows live stage with cache size', row?.stage_live === true && row?.stage_cached === 12 && !!row?.stage_last_seen, JSON.stringify(row));

  if (new URL(BASE).hostname === 'localhost') {
    console.log('# custom domain via proxy');
    const { data: domainId, error: domainError } = await adminUser.client.rpc('admin_upsert_domain', { p_domain: DOMAIN, p_event_id: eventId, p_paid_by: 'platform', p_registered_until: null, p_reason: 'uji otomatis custom domain' });
    check('admin records domain', !domainError, JSON.stringify(domainError));
    await adminUser.client.rpc('admin_set_domain_status', { p_domain_id: domainId, p_status: 'active', p_reason: 'uji otomatis aktivasi domain' });
    const root = await viaHost(DOMAIN, '/');
    check('custom domain root renders the invitation', root.status === 200 && root.body.includes('<title>Undangan Pernikahan'), `${root.status} ${root.body.slice(0, 120)}`);
    const personal = await viaHost(DOMAIN, `/to/${invs[0].personal_slug}`);
    check('custom domain /to/<guest> renders the personal invitation', personal.status === 200 && personal.body.includes('Bapak Rudi'), String(personal.status));
    const gallery = await viaHost(DOMAIN, '/galeri');
    check('custom domain /galeri renders the gallery page', gallery.status === 200, String(gallery.status));
    const unknown = await viaHost('tidak-terdaftar.test', '/');
    check('unknown host falls through to the app home', unknown.status === 200 && !unknown.body.includes('<title>Undangan Pernikahan'), String(unknown.status));
    const anon = newClient();
    await adminUser.client.rpc('admin_set_domain_status', { p_domain_id: domainId, p_status: 'failed', p_reason: 'uji otomatis nonaktif' });
    const { data: resolved } = await anon.rpc('resolve_custom_domain', { p_host: DOMAIN });
    check('inactive domain no longer resolves', resolved === null, JSON.stringify(resolved));
    if (KEEP) await adminUser.client.rpc('admin_set_domain_status', { p_domain_id: domainId, p_status: 'active', p_reason: 'uji otomatis: dibiarkan aktif untuk QA manual' });
  }

  const { data: invite } = await host.client.from('custom_domains').select('domain').eq('event_id', eventId);
  check('host can read the domain of their own event (for invite links)', invite?.length === 1 || new URL(BASE).hostname !== 'localhost', JSON.stringify(invite));
} catch (e) {
  failed++;
  console.error('  FAIL (exception)', e);
} finally {
  if (KEEP) console.log(`  data uji disimpan (KEEP=1): admin ${ADMIN_EMAIL}, event /${slug}`);
  else await cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
