// Uji end-to-end alur upload tamu: guest session -> presign -> PUT ke R2 -> confirm.
// Butuh dev server di localhost:3000 (atau BASE=https://...) dan .env.local. Membuat user/event uji lalu menghapusnya (termasuk objek R2).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const r2Configured = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every((k) => env[k]);

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + detail}`); };
const post = async (path, body, token) => {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const email = 'uji-upload@momenkita.test';
const slug = 'uji-upload';
let userId, eventId;

async function setup(pkg) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  userId = u.user.id;
  const { data: ev, error: e2 } = await admin.from('events')
    .insert({ owner_id: userId, slug, title: 'Uji Upload', status: 'active', package: pkg, photo_quota: 1000, published_at: new Date().toISOString() })
    .select('id').single();
  if (e2) throw e2;
  eventId = ev.id;
  const { data: inv } = await admin.from('invitations').insert({ event_id: eventId, guest_name: 'Ibu Sari' }).select('personal_slug').single();
  return inv.personal_slug;
}

async function cleanup() {
  if (r2Configured && eventId) {
    const s3 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    const list = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `events/${eventId}/` }));
    for (const o of list.Contents ?? []) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: o.Key }));
    console.log(`  cleanup: ${list.Contents?.length ?? 0} R2 objects deleted`);
  }
  if (eventId) await admin.from('events').delete().eq('id', eventId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

// Presigned URL memakai jam lokal; jam yang meleset > 1 menit membuat R2 membalas ExpiredRequest untuk semua PUT.
if (r2Configured) {
  const res = await fetch(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, { method: 'HEAD' });
  const skewSeconds = Math.round((Date.now() - new Date(res.headers.get('date')).getTime()) / 1000);
  if (Math.abs(skewSeconds) > 60) {
    console.log(`Jam komputer meleset ${skewSeconds} detik dari server Cloudflare. Sinkronkan jam Windows dulu, lalu ulangi.`);
    process.exit(1);
  }
}

try {
  const personalSlug = await setup('luxury');
  console.log(`# guest sessions (R2 configured: ${r2Configured})`);
  check('missing consent -> 400', (await post(`/api/events/${slug}/guest-sessions`, { displayName: 'Rina' })).status === 400);
  check('unknown event -> 404', (await post(`/api/events/tidak-ada/guest-sessions`, { displayName: 'Rina', consentVersion: 'v1' })).status === 404);
  check('empty name -> 400', (await post(`/api/events/${slug}/guest-sessions`, { displayName: '  ', consentVersion: 'v1' })).status === 400);
  const s1 = await post(`/api/events/${slug}/guest-sessions`, { displayName: 'Rina', consentVersion: 'v1' });
  check('valid session -> 201 + token', s1.status === 201 && typeof s1.body?.token === 'string', JSON.stringify(s1));
  const s2 = await post(`/api/events/${slug}/guest-sessions`, { invitationSlug: personalSlug, consentVersion: 'v1' });
  check('invitation session takes guest name', s2.status === 201 && s2.body?.displayName === 'Ibu Sari', JSON.stringify(s2.body));
  const token = s1.body.token;

  console.log('# presign');
  const files = [{ variant: 'display', contentType: 'image/webp', size: 1200 }, { variant: 'thumb', contentType: 'image/webp', size: 300 }];
  check('no token -> 401', (await post('/api/uploads/presign', { files })).status === 401);
  const [p, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sid: crypto.randomUUID() })).toString('base64url') + '.' + sig;
  check('tampered token -> 401', (await post('/api/uploads/presign', { files }, forged)).status === 401);
  check('display over 400KB -> 400', (await post('/api/uploads/presign', { files: [{ ...files[0], size: 409_601 }, files[1]] }, token)).status === 400);
  check('png display -> 400', (await post('/api/uploads/presign', { files: [{ ...files[0], contentType: 'image/png' }, files[1]] }, token)).status === 400);
  check('missing thumb -> 400', (await post('/api/uploads/presign', { files: [files[0]] }, token)).status === 400);
  check('original over 10MB -> 400', (await post('/api/uploads/presign', { files: [...files, { variant: 'original', contentType: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }] }, token)).status === 400);

  const pre = await post('/api/uploads/presign', { files: [...files, { variant: 'original', contentType: 'image/jpeg', size: 2000 }] }, token);
  if (!r2Configured) {
    check('valid presign fails clearly without R2 env (500)', pre.status === 500, JSON.stringify(pre));
  } else {
    check('valid presign -> 200 with 3 URLs', pre.status === 200 && pre.body.uploads.length === 3, JSON.stringify(pre.body));
    const url = (v) => pre.body.uploads.find((u) => u.variant === v);
    const put = (u, bytes, type) => fetch(u.url, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(bytes) });
    check('key under events/<event>/<session>/', url('display').key.startsWith(`events/${eventId}/${s1.body.sessionId}/`));
    const r2Code = async (res) => `${res.status} ${(await res.text()).match(/<Code>(.*?)<\/Code>/)?.[1] ?? ''}`;
    const wrongType = await r2Code(await put(url('display'), 1200, 'image/png'));
    check('PUT wrong content-type rejected by R2 signature', wrongType === '403 SignatureDoesNotMatch', wrongType);
    const wrongSize = await r2Code(await put(url('display'), 1300, 'image/webp'));
    check('PUT wrong size rejected by R2 signature', wrongSize === '403 SignatureDoesNotMatch', wrongSize);
    check('confirm before upload -> 422', (await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080 }, token)).status === 422);
    check('PUT display ok', (await put(url('display'), 1200, 'image/webp')).ok);
    check('PUT thumb ok', (await put(url('thumb'), 300, 'image/webp')).ok);
    const c1 = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080, caption: 'Selamat!' }, token);
    check('confirm -> 201 pending (curated), original not yet attached', c1.status === 201 && c1.body.photo.status === 'pending' && !c1.body.photo.hasOriginal, JSON.stringify(c1));
    check('presign right after -> 429 too_fast', (await post('/api/uploads/presign', { files }, token)).status === 429);
    check('PUT original ok', (await put(url('original'), 2000, 'image/jpeg')).ok);
    const c2 = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080, originalContentType: 'image/jpeg' }, token);
    check('second confirm attaches original (idempotent)', c2.status === 200 && c2.body.photo.hasOriginal === true, JSON.stringify(c2));
    const other = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 10, height: 10 }, s2.body.token);
    check('other guest cannot claim the photo', other.status === 404 || other.status === 422, JSON.stringify(other));
    const { data: row } = await admin.from('photos').select('uploader_name, bytes_display, key_original, caption').eq('id', pre.body.photoId).single();
    check('db row correct', row?.uploader_name === 'Rina' && row.bytes_display === 1200 && row.caption === 'Selamat!' && row.key_original?.endsWith('/original.jpg'), JSON.stringify(row));

    // Safari tidak bisa meng-encode WebP, jadi display/thumb JPEG juga harus diterima.
    await new Promise((r) => setTimeout(r, 3200));
    const jpegFiles = [{ variant: 'display', contentType: 'image/jpeg', size: 900 }, { variant: 'thumb', contentType: 'image/jpeg', size: 200 }];
    const pre2 = await post('/api/uploads/presign', { files: jpegFiles }, token);
    const url2 = (v) => pre2.body.uploads.find((u) => u.variant === v);
    check('presign JPEG display -> .jpg keys', pre2.status === 200 && url2('display').key.endsWith('/display.jpg'), JSON.stringify(pre2.body));
    await put(url2('display'), 900, 'image/jpeg');
    await put(url2('thumb'), 200, 'image/jpeg');
    check('confirm with unknown format -> 400', (await post('/api/uploads/confirm', { photoId: pre2.body.photoId, width: 10, height: 10, format: 'image/gif' }, token)).status === 400);
    const c3 = await post('/api/uploads/confirm', { photoId: pre2.body.photoId, width: 1440, height: 1920, format: 'image/jpeg' }, token);
    check('confirm JPEG photo -> 201', c3.status === 201, JSON.stringify(c3));

    check('other guest cannot delete the photo', (await post('/api/uploads/delete', { photoId: pre2.body.photoId }, s2.body.token)).status === 404);
    check('owner deletes own photo', (await post('/api/uploads/delete', { photoId: pre2.body.photoId }, token)).status === 200);
    const { data: deleted } = await admin.from('photos').select('status').eq('id', pre2.body.photoId).single();
    check('photo marked deleted in db', deleted?.status === 'deleted');
    const s3 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    const left = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: url2('display').key.replace(/display\.jpg$/, '') }));
    check('deleted photo files removed from R2', (left.KeyCount ?? 0) === 0, `left=${left.KeyCount}`);
  }

  await admin.from('guest_sessions').update({ is_blocked: true }).eq('id', s1.body.sessionId);
  check('blocked session -> 403', (await post('/api/uploads/presign', { files }, token)).status === 403);
  await admin.from('events').update({ package: 'complete' }).eq('id', eventId);
  check('original on Complete -> 400', (await post('/api/uploads/presign', { files: [...files, { variant: 'original', contentType: 'image/jpeg', size: 10 }] }, s2.body.token)).status === 400);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
}
