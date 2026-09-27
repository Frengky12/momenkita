// Load test alur tamu + Realtime (PRD §8 baris 5). Skala diatur lewat env; default = skala kecil untuk project dev.
//   EVENTS=5 GUESTS=10 RATE=5 DURATION=60 SUBSCRIBERS=10 BASE=http://localhost:3100 node scripts/load-test.mjs
// Target penuh PRD (50 event, 30 upload/detik, 250 koneksi realtime) dijalankan di staging/Supabase Pro sebelum pilot.
// Setiap event memakai moderasi instan, sehingga tiap upload langsung di-broadcast ke "layar panggung" (subscriber).
// Semua data uji (event, user, objek R2) dihapus di akhir.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const cfg = {
  events: Number(process.env.EVENTS ?? 5),
  guests: Number(process.env.GUESTS ?? 10),
  rate: Number(process.env.RATE ?? 5),
  duration: Number(process.env.DURATION ?? 60),
  subscribers: Number(process.env.SUBSCRIBERS ?? 10),
  base: process.env.BASE ?? 'http://localhost:3100',
};
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const newClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const s3 = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });

const DISPLAY = new Uint8Array(20_000).fill(7);
const THUMB = new Uint8Array(5_000).fill(3);
const runId = Date.now().toString(36);
const events = [];
const subscriberClients = [];
const stats = { presign: [], put: [], confirm: [], total: [], broadcast: [], errors: {}, throttled: 0, uploads: 0, deliveries: 0, expectedDeliveries: 0 };
// Waktu tiba broadcast per foto (bisa lebih dulu dari respons konfirmasi) dan waktu konfirmasi dikirim.
const arrivals = new Map();
const confirmSentAt = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (list, p) => {
  if (!list.length) return '-';
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};
const fail = (stage) => (stats.errors[stage] = (stats.errors[stage] ?? 0) + 1);
async function post(path, body, token) {
  const res = await fetch(cfg.base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function setup() {
  for (let e = 0; e < cfg.events; e++) {
    const email = `uji-beban-${runId}-${e}@momenkita.test`;
    const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    const slug = `uji-beban-${runId}-${e}`;
    const { data: ev, error: evError } = await admin.from('events')
      .insert({ owner_id: u.user.id, slug, title: `Uji Beban ${e}`, status: 'active', package: 'complete', photo_quota: 100000, moderation_mode: 'instant', published_at: new Date().toISOString() })
      .select('id').single();
    if (evError) throw evError;
    const event = { id: ev.id, slug, hostId: u.user.id, guests: [] };
    events.push(event);

    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const host = newClient();
    const { data: session } = await host.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    for (let s = 0; s < cfg.subscribers; s++) {
      const client = newClient();
      await client.realtime.setAuth(session.session.access_token);
      const joined = await new Promise((resolve) => {
        client.channel(`event:${event.id}`, { config: { private: true } })
          .on('broadcast', { event: 'photo' }, ({ payload }) => {
            const list = arrivals.get(payload.id) ?? [];
            list.push(Date.now());
            arrivals.set(payload.id, list);
          })
          .subscribe((status) => (status === 'SUBSCRIBED' ? resolve(true) : ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status) && resolve(false)));
        setTimeout(() => resolve(false), 15_000);
      });
      if (!joined) fail('realtime_join');
      subscriberClients.push(client);
    }
    for (let g = 0; g < cfg.guests; g++) {
      const res = await post(`/api/events/${slug}/guest-sessions`, { displayName: `Tamu ${g}`, consentVersion: 'v1' });
      if (res.status !== 201) throw new Error(`guest session ${res.status}`);
      event.guests.push({ token: res.body.token, nextAllowed: 0 });
    }
  }
}

async function upload(event, guest) {
  const t0 = Date.now();
  const pre = await post('/api/uploads/presign', { files: [{ variant: 'display', contentType: 'image/webp', size: DISPLAY.length }, { variant: 'thumb', contentType: 'image/webp', size: THUMB.length }] }, guest.token);
  const t1 = Date.now();
  // 429 too_fast = jeda 3 detik per sesi; klien kamera asli menunggu lalu mencoba lagi, jadi bukan kegagalan.
  if (pre.status === 429 && pre.body?.error === 'too_fast') return void stats.throttled++;
  if (pre.status !== 200) return fail(`presign_${pre.status}`);
  stats.presign.push(t1 - t0);
  const puts = await Promise.all(pre.body.uploads.map((u) => fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: u.variant === 'display' ? DISPLAY : THUMB }).then((r) => r.ok, () => false)));
  const t2 = Date.now();
  if (puts.includes(false)) return fail('put');
  stats.put.push(t2 - t1);
  // Latensi panggung (PRD §8): dari konfirmasi upload sampai pesan tiba di tiap subscriber.
  confirmSentAt.set(pre.body.photoId, t2);
  const confirm = await post('/api/uploads/confirm', { photoId: pre.body.photoId, width: 1920, height: 1080 }, guest.token);
  const t3 = Date.now();
  if (confirm.status !== 201) return fail(`confirm_${confirm.status}`);
  stats.confirm.push(t3 - t2);
  stats.total.push(t3 - t0);
  stats.uploads++;
  stats.expectedDeliveries += cfg.subscribers;
}

async function run() {
  const guests = events.flatMap((event) => event.guests.map((guest) => ({ event, guest })));
  const inflight = new Set();
  const start = Date.now();
  let started = 0;
  // Laju tetap: upload ke-n dimulai pada start + n/rate detik, memakai sesi tamu yang sudah lewat jeda 3 detik.
  while (Date.now() - start < cfg.duration * 1000) {
    const due = Math.floor(((Date.now() - start) / 1000) * cfg.rate);
    while (started < due) {
      const pick = guests.find((g) => g.guest.nextAllowed <= Date.now());
      if (!pick) {
        fail('no_free_session');
        started++;
        continue;
      }
      // Sesi sibuk sampai upload selesai, lalu jeda 3,5 detik seperti antrean kamera tamu.
      pick.guest.nextAllowed = Infinity;
      const job = upload(pick.event, pick.guest)
        .catch(() => fail('network'))
        .finally(() => {
          pick.guest.nextAllowed = Date.now() + 3_500;
          inflight.delete(job);
        });
      inflight.add(job);
      started++;
    }
    await sleep(20);
  }
  await Promise.all(inflight);
  await sleep(3_000);
  for (const [photoId, sentAt] of confirmSentAt) {
    for (const at of arrivals.get(photoId) ?? []) {
      stats.deliveries++;
      stats.broadcast.push(at - sentAt);
    }
  }
  return { started, seconds: (Date.now() - start) / 1000 };
}

async function cleanup() {
  for (const client of subscriberClients) await client.removeAllChannels();
  let objects = 0;
  for (const event of events) {
    for (;;) {
      const list = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `events/${event.id}/` }));
      if (!list.Contents?.length) break;
      await Promise.all(list.Contents.map((o) => s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: o.Key }))));
      objects += list.Contents.length;
    }
    await admin.from('events').delete().eq('id', event.id);
    await admin.auth.admin.deleteUser(event.hostId);
  }
  console.log(`cleanup: ${events.length} events, ${objects} R2 objects deleted`);
}

console.log(`load test: ${cfg.events} events x ${cfg.guests} guests, ${cfg.rate} upload/s for ${cfg.duration}s, ${cfg.events * cfg.subscribers} realtime connections, ${cfg.base}`);
try {
  await setup();
  console.log('setup done, uploading...');
  const { started, seconds } = await run();
  console.log(`\nuploads: ${stats.uploads}/${started} ok (${(stats.uploads / seconds).toFixed(2)}/s achieved)`);
  console.log(`errors: ${JSON.stringify(stats.errors)}  throttled (retried by real clients): ${stats.throttled}`);
  for (const key of ['presign', 'put', 'confirm', 'total']) {
    console.log(`${key.padEnd(9)} p50 ${pct(stats[key], 50)} ms  p95 ${pct(stats[key], 95)} ms  p99 ${pct(stats[key], 99)} ms`);
  }
  console.log(`realtime  delivered ${stats.deliveries}/${stats.expectedDeliveries}  p50 ${pct(stats.broadcast, 50)} ms  p95 ${pct(stats.broadcast, 95)} ms  p99 ${pct(stats.broadcast, 99)} ms`);
} finally {
  await cleanup();
  process.exit(0);
}
