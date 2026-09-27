// Uji end-to-end galeri & unduhan: akses galeri (tertutup/terbuka/passcode), laporan foto, manifest ZIP per peran,
// URL R2 tanpa tanda tangan, dan ZIP yang dibuat client-zip seperti di browser.
// Butuh dev server di localhost:3000 dan .env.local. Data uji (termasuk objek R2) dihapus otomatis.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { downloadZip } from 'client-zip';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const newClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + detail}`); };
const post = async (p, body, headers = {}) => {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') };
};
const get = async (p, headers = {}) => {
  const res = await fetch(BASE + p, { headers });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const email = 'uji-galeri@momenkita.test';
const slug = 'uji-galeri';
let hostId, eventId;
const anonIds = [];

async function uploadPhoto(name, caption) {
  const s = await post(`/api/events/${slug}/guest-sessions`, { displayName: name, consentVersion: 'v1' });
  const files = [{ variant: 'display', contentType: 'image/webp', size: 1500 }, { variant: 'thumb', contentType: 'image/webp', size: 400 }];
  const pre = await post('/api/uploads/presign', { files }, { authorization: `Bearer ${s.body.token}` });
  for (const u of pre.body.uploads) {
    await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: new Uint8Array(u.variant === 'display' ? 1500 : 400).fill(u.variant === 'display' ? 7 : 3) });
  }
  const c = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080, caption }, { authorization: `Bearer ${s.body.token}` });
  return c.body.photo.id;
}

async function staffDevice(link) {
  const client = newClient();
  const { data } = await client.auth.signInAnonymously();
  anonIds.push(data.user.id);
  await client.rpc('claim_staff_link', { p_token: link.token, p_pin: link.pin });
  return { client, token: data.session.access_token };
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
}

try {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  hostId = u.user.id;
  const { data: ev } = await admin.from('events')
    .insert({ owner_id: hostId, slug, title: 'Uji Galeri', status: 'active', package: 'complete', photo_quota: 1000, published_at: new Date().toISOString() })
    .select('id').single();
  eventId = ev.id;
  const now = Date.now();
  await admin.from('event_sessions').insert({ event_id: eventId, name: 'Resepsi', starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 3600e3).toISOString() });
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const host = newClient();
  await host.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });

  const ids = [];
  for (const [name, caption] of [['Rina', 'Foto satu'], ['Joko', null], ['Sari', 'Belum disetujui'], ['Andi', 'Di atas kuota']]) ids.push(await uploadPhoto(name, caption));
  for (const id of [ids[0], ids[1], ids[3]]) await host.rpc('staff_moderate_photo', { p_photo_id: id, p_action: 'approve' });
  // Foto ke-4 disimulasikan melewati kuota: tetap approved tetapi terkunci di galeri dan ZIP (PRD §3.4).
  await admin.from('photos').update({ over_quota: true }).eq('id', ids[3]);

  console.log('# gallery access');
  check('closed gallery -> 403 closed', (await get(`/api/events/${slug}/gallery`)).body?.error === 'closed');
  check('unknown event -> 404', (await get('/api/events/tidak-ada/gallery')).status === 404);
  await host.from('events').update({ gallery_public: true }).eq('id', eventId);
  const open = await get(`/api/events/${slug}/gallery`);
  check('open gallery lists approved photos within quota only', open.status === 200 && open.body.photos.length === 2
    && open.body.photos.every((p) => [ids[0], ids[1]].includes(p.id) && p.thumb_url && p.display_url && !('key_display' in p)), JSON.stringify(open.body).slice(0, 200));
  check('newest first, no more pages', open.body.photos[0].id === ids[1] && open.body.hasMore === false);
  check('?after=newest returns nothing new', (await get(`/api/events/${slug}/gallery?after=${encodeURIComponent(open.body.photos[0].created_at)}`)).body.photos.length === 0);
  check('?before=newest returns the older one', (await get(`/api/events/${slug}/gallery?before=${encodeURIComponent(open.body.photos[0].created_at)}`)).body.photos.map((p) => p.id).join() === ids[0]);
  const signed = open.body.photos[0].display_url;
  check('signed display URL downloads', (await fetch(signed)).status === 200);
  const unsigned = signed.split('?')[0];
  const bare = await fetch(unsigned);
  check('same object without signature is refused by R2', bare.status === 400 || bare.status === 403, String(bare.status));

  console.log('# passcode');
  await host.rpc('set_gallery_passcode', { p_event_id: eventId, p_passcode: 'mawar123' });
  check('passcode gallery -> 403 passcode', (await get(`/api/events/${slug}/gallery`)).body?.error === 'passcode');
  check('wrong passcode -> 401', (await post(`/api/events/${slug}/gallery/unlock`, { passcode: 'salah' })).status === 401);
  const unlocked = await post(`/api/events/${slug}/gallery/unlock`, { passcode: 'mawar123' });
  const cookie = unlocked.cookie?.split(';')[0];
  check('right passcode -> 200 + HttpOnly cookie', unlocked.status === 200 && /HttpOnly/i.test(unlocked.cookie ?? '') && cookie?.startsWith(`mk_galeri_${eventId}=`));
  check('cookie opens the gallery', (await get(`/api/events/${slug}/gallery`, { cookie })).body?.photos?.length === 2);
  await host.rpc('set_gallery_passcode', { p_event_id: eventId, p_passcode: 'melati456' });
  check('changing passcode revokes old cookies', (await get(`/api/events/${slug}/gallery`, { cookie })).body?.error === 'passcode');
  await host.rpc('set_gallery_passcode', { p_event_id: eventId, p_passcode: '' });

  console.log('# reports');
  check('report approved photo -> 200', (await post(`/api/events/${slug}/gallery/report`, { photoId: ids[0], reason: 'privacy' })).status === 200);
  check('duplicate report from same device -> still 200', (await post(`/api/events/${slug}/gallery/report`, { photoId: ids[0], reason: 'other' })).status === 200);
  const { count } = await admin.from('photo_reports').select('id', { count: 'exact', head: true }).eq('photo_id', ids[0]);
  check('only one report stored per device', count === 1);
  check('invalid reason -> 400', (await post(`/api/events/${slug}/gallery/report`, { photoId: ids[0], reason: 'bosan' })).status === 400);
  check('pending photo cannot be reported -> 404', (await post(`/api/events/${slug}/gallery/report`, { photoId: ids[2], reason: 'other' })).status === 404);
  check('host sees the report (RLS)', (await host.from('photo_reports').select('id')).data?.length === 1);

  console.log('# download manifest');
  const links = {};
  for (const role of ['photographer', 'moderator']) links[role] = (await host.rpc('create_staff_link', { p_event_id: eventId, p_role: role, p_label: role })).data;
  const photographer = await staffDevice(links.photographer);
  const moderator = await staffDevice(links.moderator);
  const dl = await get(`/api/staff/events/${eventId}/download?variant=display`, { authorization: `Bearer ${photographer.token}` });
  check('photographer manifest: approved within quota, oldest first', dl.status === 200 && dl.body.files.map((f) => f.id).join() === [ids[0], ids[1]].join(), JSON.stringify(dl.body).slice(0, 200));
  const expires = Number(new URL(dl.body.files[0].url).searchParams.get('X-Amz-Expires'));
  check('download URLs valid for at least 6 hours', expires >= 6 * 3600, String(expires));
  check('originals refused on Complete -> 400', (await get(`/api/staff/events/${eventId}/download?variant=original`, { authorization: `Bearer ${photographer.token}` })).body?.error === 'original_luxury_only');
  check('moderator cannot download -> 403', (await get(`/api/staff/events/${eventId}/download`, { authorization: `Bearer ${moderator.token}` })).status === 403);
  check('no token -> 401', (await get(`/api/staff/events/${eventId}/download`)).status === 401);
  const summary = (await photographer.client.rpc('staff_gallery_summary', { p_event_id: eventId })).data;
  check('summary: 2 downloadable, 1 locked', summary?.downloadable === 2 && summary?.locked === 1, JSON.stringify(summary));

  console.log('# zip');
  async function* entries() {
    for (const [i, f] of dl.body.files.entries()) yield { name: `${String(i + 1).padStart(4, '0')}_${f.uploader_name.toLowerCase()}.${f.ext}`, lastModified: new Date(f.created_at), input: await fetch(f.url) };
  }
  const zipPath = path.join(os.tmpdir(), `momenkita-uji-${Date.now()}.zip`);
  fs.writeFileSync(zipPath, Buffer.from(await downloadZip(entries()).arrayBuffer()));
  const listing = execFileSync('unzip', ['-l', zipPath]).toString();
  const test = execFileSync('unzip', ['-t', zipPath]).toString();
  check('ZIP lists both photos with ordered names', listing.includes('0001_rina.webp') && listing.includes('0002_joko.webp'), listing);
  check('ZIP passes integrity test (CRC)', /No errors detected/.test(test), test);
  check('ZIP stores original bytes (1500 + 1500)', /\s3000\s+2 files/.test(listing), listing);
  fs.rmSync(zipPath);
} catch (error) {
  failed++;
  console.log('  FAIL unexpected error', error);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
