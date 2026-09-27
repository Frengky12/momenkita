// Uji end-to-end hari-H: link staf + PIN, API foto staf (signed URL R2), broadcast Realtime, moderasi, check-in.
// Butuh dev server di localhost:3000 dan .env.local. Membuat host/event/perangkat staf uji lalu menghapus semuanya (termasuk objek R2).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const newClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + detail}`); };
const post = async (path, body, token) => {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const staffPhotos = async (token, query = '') => {
  const res = await fetch(`${BASE}/api/staff/events/${eventId}/photos${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const email = 'uji-staf@momenkita.test';
const slug = 'uji-staf';
let hostId, eventId;
const anonIds = [];

async function staffDevice(link) {
  const client = newClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  anonIds.push(data.user.id);
  const { data: claim } = await client.rpc('claim_staff_link', { p_token: link.token, p_pin: link.pin });
  return { client, token: data.session.access_token, claim };
}

async function uploadPhoto(caption) {
  const session = await post(`/api/events/${slug}/guest-sessions`, { displayName: `Tamu ${caption}`, consentVersion: 'v1' });
  const files = [{ variant: 'display', contentType: 'image/webp', size: 1200 }, { variant: 'thumb', contentType: 'image/webp', size: 300 }];
  const pre = await post('/api/uploads/presign', { files }, session.body.token);
  for (const u of pre.body.uploads) {
    await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: new Uint8Array(u.variant === 'display' ? 1200 : 300) });
  }
  const confirm = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080, caption }, session.body.token);
  return confirm.body.photo.id;
}

async function cleanup() {
  if (eventId) {
    const s3 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    const list = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `events/${eventId}/` }));
    for (const o of list.Contents ?? []) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: o.Key }));
    console.log(`  cleanup: ${list.Contents?.length ?? 0} R2 objects deleted`);
    await admin.from('events').delete().eq('id', eventId);
  }
  for (const id of [hostId, ...anonIds].filter(Boolean)) await admin.auth.admin.deleteUser(id);
  console.log(`  cleanup: ${anonIds.length} staff devices + host deleted`);
}

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  hostId = u.user.id;
  const { data: ev } = await admin.from('events')
    .insert({ owner_id: hostId, slug, title: 'Uji Staf', status: 'active', package: 'complete', photo_quota: 1000, published_at: new Date().toISOString() })
    .select('id').single();
  eventId = ev.id;
  const now = Date.now();
  await admin.from('event_sessions').insert({ event_id: eventId, name: 'Resepsi', starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 3600e3).toISOString() });
  const { data: invs } = await admin.from('invitations').insert([
    { event_id: eventId, guest_name: 'Bapak Rudi', category: 'vip', table_number: '1', pax_allowed: 2 },
    { event_id: eventId, guest_name: 'Ibu Sari', category: 'regular', table_number: '2', pax_allowed: 1 },
  ]).select('id, qr_token');
  await admin.from('wishes').insert({ event_id: eventId, author_name: 'Rina', message: 'Selamat menempuh hidup baru!' });

  // Host masuk tanpa email: token_hash magic link diverifikasi langsung.
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const host = newClient();
  await host.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

  console.log('# staff links');
  const links = {};
  for (const role of ['moderator', 'receptionist', 'stage']) {
    links[role] = (await host.rpc('create_staff_link', { p_event_id: eventId, p_role: role, p_label: `${role} uji` })).data;
  }
  check('host creates 3 links', Object.values(links).every((l) => l?.token && /^\d{6}$/.test(l.pin)));
  const mod = await staffDevice(links.moderator);
  const rec = await staffDevice(links.receptionist);
  const rec2 = await staffDevice(links.receptionist);
  const stage = await staffDevice(links.stage);
  check('anonymous devices claim links', [mod, rec, rec2, stage].every((d) => d.claim?.ok), JSON.stringify(mod.claim));
  const wrong = await staffDevice({ token: links.moderator.token, pin: links.moderator.pin === '000000' ? '111111' : '000000' });
  check('wrong PIN rejected', wrong.claim?.error === 'pin_invalid', JSON.stringify(wrong.claim));

  console.log('# staff photo API');
  const photoIds = [];
  for (let i = 1; i <= 3; i++) photoIds.push(await uploadPhoto(`foto ${i}`));
  check('3 photos uploaded (curated -> pending)', photoIds.every(Boolean));
  check('no token -> 401', (await staffPhotos(null)).status === 401);
  check('receptionist -> 403', (await staffPhotos(rec.token)).status === 403);
  check('invalid event id -> 404', (await fetch(`${BASE}/api/staff/events/abc/photos`, { headers: { authorization: `Bearer ${mod.token}` } })).status === 404);
  const modList = await staffPhotos(mod.token, '?variants=thumb');
  check('moderator sees 3 pending with thumb URLs only', modList.status === 200 && modList.body.photos.length === 3
    && modList.body.photos.every((p) => p.status === 'pending' && p.thumb_url && p.display_url === null && !('key_display' in p)), JSON.stringify(modList.body).slice(0, 300));
  check('serverTime returned', Math.abs(modList.body.serverTime - Date.now()) < 60_000);
  const img = await fetch(modList.body.photos[0].thumb_url, { headers: { Origin: BASE } });
  check('signed thumb URL downloadable with CORS', img.status === 200 && img.headers.get('access-control-allow-origin') === BASE, `${img.status} ${img.headers.get('access-control-allow-origin')}`);
  const again = await staffPhotos(mod.token, '?variants=thumb');
  check('signed URL stable within the hour (cacheable)', again.body.photos[0].thumb_url === modList.body.photos.find((p) => p.id === again.body.photos[0].id).thumb_url);
  check('stage sees no pending photos', (await staffPhotos(stage.token)).body.photos.length === 0);
  const hostToken = (await host.auth.getSession()).data.session.access_token;
  check('host sees pending photos (full access)', (await staffPhotos(hostToken)).body.photos.length === 3);
  check('?status=approved hides pending even for host (stage opened by host)', (await staffPhotos(hostToken, '?status=approved')).body.photos.length === 0);

  console.log('# realtime + moderation');
  const received = [];
  await stage.client.realtime.setAuth(stage.token);
  const channel = stage.client.channel(`event:${eventId}`, { config: { private: true } })
    .on('broadcast', { event: 'photo' }, ({ payload }) => received.push({ at: Date.now(), kind: 'photo', payload }))
    .on('broadcast', { event: 'stage' }, ({ payload }) => received.push({ at: Date.now(), kind: 'stage', payload }));
  const subscribed = await new Promise((resolve) => { channel.subscribe((s) => { if (s === 'SUBSCRIBED') resolve(true); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(false); }); setTimeout(() => resolve(false), 10_000); });
  check('stage device joins private channel', subscribed);

  const latencies = [];
  for (const id of photoIds.slice(0, 2)) {
    const t0 = Date.now();
    const r = await mod.client.rpc('staff_moderate_photo', { p_photo_id: id, p_action: 'approve' });
    for (let i = 0; i < 50 && !received.some((m) => m.payload.id === id && m.payload.status === 'approved'); i++) await sleep(50);
    const msg = received.find((m) => m.payload.id === id && m.payload.status === 'approved');
    latencies.push(msg ? msg.at - t0 : Infinity);
    check(`approve -> broadcast to stage (${msg ? msg.at - t0 : 'none'} ms)`, r.data?.ok && msg && msg.at - t0 <= 2000);
  }
  const stageList = await staffPhotos(stage.token, `?ids=${photoIds[0]}&variants=display`);
  check('stage fetches approved photo by id with display URL', stageList.body.photos.length === 1 && stageList.body.photos[0].display_url && stageList.body.photos[0].thumb_url === null);
  const dup = await mod.client.rpc('staff_moderate_photo', { p_photo_id: photoIds[0], p_action: 'approve' });
  check('second moderator action -> no_change', dup.data?.error === 'no_change');
  const bulk = await host.rpc('staff_approve_photos', { p_event_id: eventId, p_photo_ids: photoIds });
  check('host bulk approve approves only remaining pending', bulk.data?.approved === 1, JSON.stringify(bulk));
  const t1 = Date.now();
  await mod.client.rpc('staff_set_blackout', { p_event_id: eventId, p_on: true });
  for (let i = 0; i < 40 && !received.some((m) => m.kind === 'stage'); i++) await sleep(50);
  const bo = received.find((m) => m.kind === 'stage');
  check(`blackout reaches stage (${bo ? bo.at - t1 : 'none'} ms, KP <= 1000)`, bo?.payload.stage_blackout === true && bo.at - t1 <= 1000);
  await mod.client.rpc('staff_moderate_photo', { p_photo_id: photoIds[1], p_action: 'reject' });
  check('stage list drops rejected photo', (await staffPhotos(stage.token)).body.photos.length === 2);
  const wishes = await stage.client.rpc('staff_wishes', { p_event_id: eventId });
  check('stage reads wishes', wishes.data?.length === 1);
  stage.client.removeChannel(channel);

  console.log('# check-in');
  const list = await rec.client.rpc('staff_guest_list', { p_event_id: eventId });
  check('receptionist loads guest list with QR tokens', list.data?.length === 2 && list.data.every((g) => g.qr_token), JSON.stringify(list.error ?? list.data).slice(0, 300));
  const [a, b] = await Promise.all([
    rec.client.rpc('staff_check_in', { p_event_id: eventId, p_qr_token: invs[0].qr_token }),
    rec2.client.rpc('staff_check_in', { p_event_id: eventId, p_qr_token: invs[0].qr_token }),
  ]);
  check('two devices scanning the same QR -> one check-in', [a.data, b.data].filter((r) => r?.ok && !r.already).length === 1 && [a.data, b.data].filter((r) => r?.already).length === 1);
  check('check-in card shows desk label and pax', [a.data, b.data].every((r) => r.invitation.checked_in_by === 'receptionist uji' && r.invitation.checked_in_pax === 2));
  const offlineAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const late = await rec.client.rpc('staff_check_in', { p_event_id: eventId, p_invitation_id: invs[1].id, p_pax: 3, p_checked_in_at: offlineAt });
  check('offline check-in keeps original time', Math.abs(Date.parse(late.data.invitation.checked_in_at) - Date.parse(offlineAt)) < 1000);
  const walkId = crypto.randomUUID();
  const w1 = await rec.client.rpc('staff_add_walk_in', { p_event_id: eventId, p_guest_name: 'Tamu Dadakan', p_pax: 2, p_id: walkId });
  const w2 = await rec.client.rpc('staff_add_walk_in', { p_event_id: eventId, p_guest_name: 'Tamu Dadakan', p_pax: 2, p_id: walkId });
  const { count } = await admin.from('invitations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('guest_name', 'Tamu Dadakan');
  check('walk-in resend is idempotent', w1.data?.ok && w2.data?.already && count === 1);

  console.log('# revocation');
  await host.from('staff_links').update({ revoked_at: new Date().toISOString() }).eq('id', links.moderator.id);
  check('revoked moderator -> 403 on photo API', (await staffPhotos(mod.token)).status === 403);
  const denied = await mod.client.rpc('staff_moderate_photo', { p_photo_id: photoIds[0], p_action: 'reject' });
  check('revoked moderator cannot moderate', denied.status === 403 || /akses ditolak/.test(denied.error?.message ?? ''), JSON.stringify(denied.error));
  console.log(`  approve->stage latency ms: ${latencies.join(', ')}`);
} catch (error) {
  failed++;
  console.log('  FAIL unexpected error', error);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
