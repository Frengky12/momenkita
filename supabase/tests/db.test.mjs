import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Menjalankan migrasi di PGlite (PostgreSQL in-process) dengan tiruan auth/realtime Supabase,
// lalu menguji RLS, grant, trigger, dan RPC. Jalankan: npm run test:db
const MIG = fileURLToPath(new URL('../migrations/', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })

await db.exec(fs.readFileSync(new URL('./supabase_stub.sql', import.meta.url), 'utf8'))
for (const f of fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'))
    console.log(`migrated ${f}`)
  } catch (e) {
    console.error(`MIGRATION FAILED ${f}: ${e.message}`)
    process.exit(1)
  }
}

let passed = 0
let failed = 0
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`) } else { failed++; console.log(`  FAIL ${name} ${detail}`) }
}
async function expectErr(name, promise, re) {
  try { const r = await promise; failed++; console.log(`  FAIL ${name} (expected error ${re}, got ${JSON.stringify(r).slice(0, 200)})`) }
  catch (e) { check(name, re.test(e.message), `-> ${e.message}`) }
}

// who: 'postgres' | 'service' | 'anon' | { id, anon? }
async function as(who, sql, params = [], topic = null) {
  return db.transaction(async (tx) => {
    if (who === 'service') await tx.exec('set local role service_role')
    else if (who === 'anon') await tx.exec('set local role anon')
    else if (who !== 'postgres') {
      await tx.exec('set local role authenticated')
      await tx.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: who.id, role: 'authenticated', is_anonymous: !!who.anon })])
    }
    if (topic) await tx.query(`select set_config('realtime.topic', $1, true)`, [topic])
    return (await tx.query(sql, params)).rows
  })
}
const one = async (...a) => (await as(...a))[0]

console.log('\n# users & profiles')
const mkUser = async (email, anon = false) =>
  (await one('postgres', `insert into auth.users (email, raw_user_meta_data, is_anonymous) values ($1, $2, $3) returning id`,
    [email, JSON.stringify({ full_name: email?.split('@')[0] }), anon])).id
const hostA = { id: await mkUser('ani@x.id') }
const hostB = { id: await mkUser('budi@x.id') }
const admin = { id: await mkUser('admin@x.id') }
const recDevice = { id: await mkUser(null, true), anon: true }
const modDevice = { id: await mkUser(null, true), anon: true }
const photoDevice = { id: await mkUser(null, true), anon: true }
await as('postgres', `update public.profiles set role = 'admin' where id = $1`, [admin.id])
check('profiles created only for registered users',
  (await one('postgres', `select count(*)::int n from public.profiles`)).n === 3)
check('full_name copied from metadata', (await one(hostA, `select full_name from public.profiles where id = auth.uid()`)).full_name === 'ani')
await expectErr('host cannot promote self to admin', as(hostA, `update public.profiles set role = 'admin' where id = auth.uid()`), /permission denied/)

console.log('\n# anon')
check('anon reads active catalog', (await as('anon', `select * from public.catalog_items`)).length === 11)
await expectErr('anon cannot read events', as('anon', `select * from public.events`), /permission denied/)
await expectErr('anon cannot call helper', as('anon', `select public.is_event_manager(gen_random_uuid())`), /permission denied/)

console.log('\n# events')
const ev = await one(hostA, `insert into public.events (slug, title) values ('budi-ani', 'Budi & Ani') returning *`)
check('host inserts event with RETURNING (owner defaulted)', ev.owner_id === hostA.id && ev.status === 'draft' && ev.package === null)
await expectErr('host cannot set package on insert',
  as(hostA, `insert into public.events (slug, title, package) values ('x-y', 'X', 'luxury')`), /permission denied/)
await expectErr('host cannot update package', as(hostA, `update public.events set package = 'luxury' where id = $1`, [ev.id]), /permission denied/)
await expectErr('host cannot update photo_quota', as(hostA, `update public.events set photo_quota = 99999 where id = $1`, [ev.id]), /permission denied/)
await expectErr('draft cannot be published', as(hostA, `update public.events set published_at = now() where id = $1`, [ev.id]), /row-level security/)
check('other host cannot see event', (await as(hostB, `select * from public.events`)).length === 0)
check('other host update affects 0 rows', (await as(hostB, `update public.events set title = 'hack' where id = $1 returning id`, [ev.id])).length === 0)
await expectErr('anonymous staff device cannot create event',
  as(recDevice, `insert into public.events (slug, title) values ('spam-event', 'Spam')`), /row-level security/)
await expectErr('bad slug rejected', as(hostA, `insert into public.events (slug, title) values ('Budi Ani!', 'x')`), /check constraint/)
await expectErr('slug that shadows an app route rejected',
  as(hostA, `insert into public.events (slug, title) values ('dashboard', 'x')`), /events_slug_not_reserved/)

console.log('\n# organizations')
const org = await one(hostA, `insert into public.organizations (name, slug) values ('WO Bahagia', 'wo-bahagia') returning *`)
check('org insert with RETURNING works', !!org?.id)
check('creator became owner', (await one(hostA, `select role from public.org_members where organization_id = $1`, [org.id])).role === 'owner')
await expectErr('owner cannot self-enable white_label',
  as(hostA, `update public.organizations set white_label = true where id = $1`, [org.id]), /permission denied/)
check('non-member cannot see org', (await as(hostB, `select * from public.organizations`)).length === 0)

console.log('\n# sessions & invitations')
await as(hostA, `insert into public.event_sessions (event_id, name, starts_at, ends_at) values
  ($1, 'Akad', '2026-12-12 08:00+07', '2026-12-12 10:00+07'),
  ($1, 'Resepsi', '2026-12-12 11:00+07', '2026-12-12 14:00+07')`, [ev.id])
const invs = await as(hostA, `insert into public.invitations (event_id, guest_name, category, table_number, rsvp_pax) values
  ($1, 'Bapak Rudi', 'vip', 'A1', 2), ($1, 'Bapak Rudi', 'regular', 'B2', null), ($1, '!!!', 'family', 'C3', 1)
  returning *`, [ev.id])
check('personal_slug generated with 6-char suffix', /^bapak-rudi-[a-z0-9]{6}$/.test(invs[0].personal_slug), invs[0].personal_slug)
check('same names get different slugs', invs[0].personal_slug !== invs[1].personal_slug)
check('non-latin name falls back to "tamu"', /^tamu-[a-z0-9]{6}$/.test(invs[2].personal_slug), invs[2].personal_slug)
check('qr_token is 32 hex chars', /^[0-9a-f]{32}$/.test(invs[0].qr_token))
check('bulk insert did not broadcast', (await one('postgres', `select count(*)::int n from realtime.messages where event = 'invitation'`)).n === 0)

console.log('\n# payments')
await expectErr('authenticated cannot create orders', as(hostA,
  `insert into public.orders (profile_id, event_id, item_code, amount_idr) values (auth.uid(), $1, 'complete', 1)`, [ev.id]), /permission denied/)
const order = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'complete', 399000) returning id`, [hostA.id, ev.id])
await expectErr('authenticated cannot call fulfill_order', as(hostA, `select public.fulfill_order($1, 'trx', 399000)`, [order.id]), /permission denied/)
await expectErr('amount mismatch rejected', as('service', `select public.fulfill_order($1, 'trx-1', 1000)`, [order.id]), /tidak cocok/)
const f1 = await one('service', `select public.fulfill_order($1, 'trx-1', 399000) r`, [order.id])
check('fulfill_order activates', f1.r.ok && !f1.r.already_paid)
const evPaid = await one('postgres', `select * from public.events where id = $1`, [ev.id])
check('event active complete quota 1000', evPaid.status === 'active' && evPaid.package === 'complete' && evPaid.photo_quota === 1000)
const f2 = await one('service', `select public.fulfill_order($1, 'trx-1', 399000) r`, [order.id])
check('fulfill_order idempotent', f2.r.already_paid === true)
check('host sees own paid order', (await as(hostA, `select status from public.orders`))[0]?.status === 'paid')
await as(hostA, `update public.events set published_at = now() where id = $1`, [ev.id])
check('paid event can be published', true)

console.log('\n# staff links')
const links = {}
for (const role of ['receptionist', 'moderator', 'stage', 'photographer']) {
  links[role] = (await one(hostA, `select public.create_staff_link($1, $2, $3) r`, [ev.id, role, `${role} 1`])).r
}
check('create_staff_link returns token + 6-digit pin', links.receptionist.token.length === 32 && /^\d{6}$/.test(links.receptionist.pin))
check('expires H+1 23:59:59 WIB', new Date(links.receptionist.expires_at).toISOString() === '2026-12-13T16:59:59.000Z', links.receptionist.expires_at)
check('only hashes stored', (await one('postgres', `select count(*)::int n from public.staff_links where token_hash = $1`, [links.receptionist.token])).n === 0)
await expectErr('other host cannot create staff link', as(hostB, `select public.create_staff_link($1, 'moderator')`, [ev.id]), /akses ditolak/)

const wrongPin = links.receptionist.pin === '000000' ? '111111' : '000000'
let last
for (let i = 0; i < 5; i++) last = (await one(recDevice, `select public.claim_staff_link($1, $2) r`, [links.receptionist.token, wrongPin])).r
check('wrong pin rejected', last.error === 'pin_invalid')
const locked = (await one(recDevice, `select public.claim_staff_link($1, $2) r`, [links.receptionist.token, links.receptionist.pin])).r
check('locked after 5 failures even with right pin', locked.error === 'locked')
check('failed attempts persisted despite no raise', (await one('postgres', `select failed_pin_attempts n from public.staff_links where id = $1`, [links.receptionist.id])).n === 5)
await as('postgres', `update public.staff_links set locked_until = now() - interval '1 second' where id = $1`, [links.receptionist.id])
const claimed = (await one(recDevice, `select public.claim_staff_link($1, $2) r`, [links.receptionist.token, links.receptionist.pin])).r
check('claim succeeds after lock expires', claimed.ok && claimed.role === 'receptionist')
check('counter reset', (await one('postgres', `select failed_pin_attempts n from public.staff_links where id = $1`, [links.receptionist.id])).n === 0)
check('bogus token rejected', (await one(recDevice, `select public.claim_staff_link('nope', '123456') r`)).r.error === 'link_invalid')
check('moderator claims', (await one(modDevice, `select public.claim_staff_link($1, $2) r`, [links.moderator.token, links.moderator.pin])).r.ok)
check('photographer claims', (await one(photoDevice, `select public.claim_staff_link($1, $2) r`, [links.photographer.token, links.photographer.pin])).r.ok)

console.log('\n# reception')
const ctx = (await one(recDevice, `select public.staff_event($1) r`, [ev.id])).r
check('staff_event returns context', ctx.title === 'Budi & Ani' && ctx.sessions.length === 2 && ctx.staff_roles[0] === 'receptionist' && ctx.is_manager === false)
const list = await as(recDevice, `select * from public.staff_guest_list($1)`, [ev.id])
check('receptionist gets guest list without phone', list.length === 3 && !('phone_number' in list[0]))
check('receptionist cannot read invitations table directly', (await as(recDevice, `select * from public.invitations`)).length === 0)
await expectErr('receptionist cannot list photos', as(recDevice, `select * from public.staff_photos($1)`, [ev.id]), /akses ditolak/)
const c1 = (await one(recDevice, `select public.staff_check_in($1, $2) r`, [ev.id, invs[0].qr_token])).r
check('check-in by QR', c1.ok && !c1.already && c1.invitation.checked_in_pax === 2 && c1.invitation.checked_in_by === 'receptionist 1')
const c2 = (await one(recDevice, `select public.staff_check_in($1, $2) r`, [ev.id, invs[0].qr_token])).r
check('second scan reports already', c2.ok && c2.already === true)
const c3 = (await one(recDevice, `select public.staff_check_in($1, null, $2, 3, now() + interval '1 hour') r`, [ev.id, invs[1].id])).r
check('manual check-in, future time clamped', c3.ok && new Date(c3.invitation.checked_in_at) <= new Date() && c3.invitation.checked_in_pax === 3)
check('unknown QR not_found', (await one(recDevice, `select public.staff_check_in($1, 'zzz') r`, [ev.id])).r.error === 'not_found')
const w = (await one(recDevice, `select public.staff_add_walk_in($1, 'Tamu Dadakan', 2) r`, [ev.id])).r
check('walk-in added and checked in', w.ok && w.invitation.checked_in_pax === 2)
check('check-ins broadcast', (await one('postgres', `select count(*)::int n from realtime.messages where event = 'invitation' and topic = $1`, ['event:' + ev.id])).n === 3)
const listAfter = await as(recDevice, `select * from public.staff_guest_list($1)`, [ev.id])
check('guest list carries check-in desk label', listAfter.find((g) => g.id === invs[0].id).checked_in_by === 'receptionist 1')
const walkId = '11111111-1111-4111-8111-111111111111'
const w1 = (await one(recDevice, `select public.staff_add_walk_in($1, 'Tamu Offline', 1, $2) r`, [ev.id, walkId])).r
const w2 = (await one(recDevice, `select public.staff_add_walk_in($1, 'Tamu Offline', 1, $2) r`, [ev.id, walkId])).r
check('walk-in with device id is idempotent', w1.ok && !w1.already && w2.already === true
  && (await one('postgres', `select count(*)::int n from public.invitations where guest_name = 'Tamu Offline'`)).n === 1)
const otherEv = await one(hostB, `insert into public.events (slug, title) values ('lain-ev', 'Lain') returning id`)
const otherInv = await one(hostB, `insert into public.invitations (event_id, guest_name) values ($1, 'Rahasia') returning id`, [otherEv.id])
await expectErr('walk-in id of another event rejected',
  as(recDevice, `select public.staff_add_walk_in($1, 'X', 1, $2)`, [ev.id, otherInv.id]), /akses ditolak/)
await as(hostB, `delete from public.events where id = $1`, [otherEv.id])
await expectErr('receptionist cannot blackout', as(recDevice, `select public.staff_set_blackout($1, true)`, [ev.id]), /akses ditolak/)

console.log('\n# photos')
const gs = await one('service', `insert into public.guest_sessions (event_id, display_name, consent_version) values ($1, 'Sinta', 'v1') returning id`, [ev.id])
const key = (n) => `events/${ev.id}/${n}`
const insPhoto = (n, extra = {}) => one('service', `insert into public.photos (event_id, guest_session_id, key_display, key_thumb, key_original, width, height, bytes_display, status, uploader_name)
  values ($1, $2, $3, $4, $5, 1920, 1080, 300000, $6, $7) returning *`,
  [ev.id, gs.id, key(n + '.webp'), key(n + '_t.webp'), extra.original ?? null, extra.status ?? 'approved', extra.name ?? 'Hacker'])
const p1 = await insPhoto('p1', { original: key('p1.jpg') })
check('curated -> pending regardless of requested status', p1.status === 'pending' && p1.visible_after === null)
check('uploader_name forced from session', p1.uploader_name === 'Sinta')
check('key_original dropped for non-luxury', p1.key_original === null)
await expectErr('foreign key prefix rejected', one('service', `insert into public.photos (event_id, guest_session_id, key_display, key_thumb, width, height, bytes_display)
  values ($1, $2, 'events/other/x.webp', 'events/other/y.webp', 10, 10, 10)`, [ev.id, gs.id]), /check constraint/)
check('photo broadcast on insert', (await one('postgres', `select count(*)::int n from realtime.messages where event = 'photo'`)).n === 1)

const modList = await as(modDevice, `select * from public.staff_photos($1)`, [ev.id])
check('moderator sees pending', modList.length === 1 && modList[0].status === 'pending')
check('photographer does not see pending', (await as(photoDevice, `select * from public.staff_photos($1)`, [ev.id])).length === 0)
const a1 = (await one(modDevice, `select public.staff_moderate_photo($1, 'approve') r`, [p1.id])).r
check('approve', a1.ok && a1.status === 'approved')
check('second approve -> no_change', (await one(modDevice, `select public.staff_moderate_photo($1, 'approve') r`, [p1.id])).r.error === 'no_change')
check('pin', (await one(modDevice, `select public.staff_moderate_photo($1, 'pin') r`, [p1.id])).r.is_pinned === true)
const moderated = await one('postgres', `select * from public.photos where id = $1`, [p1.id])
check('moderated_by staff link recorded', moderated.moderated_by_staff_link_id === links.moderator.id && moderated.visible_after !== null)
check('photographer sees approved', (await as(photoDevice, `select * from public.staff_photos($1)`, [ev.id])).length === 1)
await expectErr('photographer cannot moderate', as(photoDevice, `select public.staff_moderate_photo($1, 'reject')`, [p1.id]), /akses ditolak/)
await expectErr('unknown action', as(modDevice, `select public.staff_moderate_photo($1, 'nuke')`, [p1.id]), /aksi tidak dikenal/)
const r1 = (await one(modDevice, `select public.staff_moderate_photo($1, 'reject') r`, [p1.id])).r
check('reject approved photo (takedown) also unpins', r1.ok && r1.status === 'rejected' && r1.is_pinned === false)
check('host sees photos via RLS', (await as(hostA, `select * from public.photos`)).length === 1)
check('other host sees no photos', (await as(hostB, `select * from public.photos`)).length === 0)
await expectErr('host cannot update photos directly', as(hostA, `update public.photos set status = 'approved'`), /permission denied/)
check('host moderates via RPC', (await one(hostA, `select public.staff_moderate_photo($1, 'reject') r`, [p1.id])).r.error === 'no_change')

console.log('\n# bulk approve, stage, wishes')
check('staff_photos returns guest_session_id', modList[0].guest_session_id === gs.id)
check('staff_photos filters by ids', (await as(modDevice, `select * from public.staff_photos($1, 500, $2::uuid[])`, [ev.id, [p1.id]])).length === 1
  && (await as(modDevice, `select * from public.staff_photos($1, 500, $2::uuid[])`, [ev.id, [gs.id]])).length === 0)
const pA = await insPhoto('pA')
const pB = await insPhoto('pB')
const bulk = (await one(modDevice, `select public.staff_approve_photos($1, $2::uuid[]) r`, [ev.id, [pA.id, p1.id]])).r
check('bulk approve only pending photos in the list', bulk.ok && bulk.approved === 1)
check('photo outside the list stays pending', (await one('postgres', `select status from public.photos where id = $1`, [pB.id])).status === 'pending')
await expectErr('photographer cannot bulk approve', as(photoDevice, `select public.staff_approve_photos($1, $2::uuid[])`, [ev.id, [pB.id]]), /akses ditolak/)
const stageDevice = { id: await mkUser(null, true), anon: true }
check('stage claims', (await one(stageDevice, `select public.claim_staff_link($1, $2) r`, [links.stage.token, links.stage.pin])).r.ok)
const stagePhotos = await as(stageDevice, `select * from public.staff_photos($1, 200)`, [ev.id])
check('stage sees approved only', stagePhotos.length === 1 && stagePhotos[0].id === pA.id)
await expectErr('stage cannot moderate', as(stageDevice, `select public.staff_moderate_photo($1, 'reject')`, [pA.id]), /akses ditolak/)
await as('service', `insert into public.wishes (event_id, author_name, message, is_hidden) values ($1, 'Rina', 'Selamat!', false), ($1, 'Spam', 'x', true)`, [ev.id])
const stageWishes = await as(stageDevice, `select * from public.staff_wishes($1)`, [ev.id])
check('stage reads visible wishes only', stageWishes.length === 1 && stageWishes[0].author_name === 'Rina')
await expectErr('receptionist cannot read wishes', as(recDevice, `select * from public.staff_wishes($1)`, [ev.id]), /akses ditolak/)
await as(modDevice, `select public.staff_moderate_photo($1, 'reject'), public.staff_moderate_photo($2, 'reject')`, [pA.id, pB.id])

console.log('\n# moderation modes, blackout, realtime')
await as(hostA, `update public.events set moderation_mode = 'delayed' where id = $1`, [ev.id])
const p2 = await insPhoto('p2')
const delay = (new Date(p2.visible_after) - new Date(p2.created_at)) / 1000
check('delayed -> approved, visible after ~15s', p2.status === 'approved' && Math.abs(delay - 15) < 1, `delay=${delay}`)
await as(hostA, `update public.events set moderation_mode = 'instant' where id = $1`, [ev.id])
const p3 = await insPhoto('p3')
check('instant -> approved now', p3.status === 'approved' && Math.abs(new Date(p3.visible_after) - new Date(p3.created_at)) < 1000)
check('stage broadcast on mode change', (await one('postgres', `select count(*)::int n from realtime.messages where event = 'stage'`)).n === 2)
const b = (await one(modDevice, `select public.staff_set_blackout($1, true) r`, [ev.id])).r
check('moderator blackout', b.ok && (await one('postgres', `select stage_blackout from public.events where id = $1`, [ev.id])).stage_blackout === true)
const topic = 'event:' + ev.id
check('staff receives event channel', (await as(modDevice, `select * from realtime.messages`, [], topic)).length > 0)
check('manager receives event channel', (await as(hostA, `select * from realtime.messages`, [], topic)).length > 0)
check('outsider receives nothing', (await as(hostB, `select * from realtime.messages`, [], topic)).length === 0)
check('malformed topic receives nothing', (await as(hostA, `select * from realtime.messages`, [], 'event:x')).length === 0)

console.log('\n# quota')
await as('postgres', `update public.events set photo_quota = 3 where id = $1`, [ev.id])
const p4 = await insPhoto('p4')
const p5 = await insPhoto('p5')
check('3rd active photo within quota', p4.over_quota === false, `p4=${p4.over_quota}`)
check('photo beyond quota flagged but approved', p5.over_quota === true && p5.status === 'approved')
check('photographer excludes over-quota', (await as(photoDevice, `select * from public.staff_photos($1)`, [ev.id])).every((p) => !p.over_quota))
const addon = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'addon_photos_500', 79000) returning id`, [hostA.id, ev.id])
await as('service', `select public.fulfill_order($1, 'trx-2', 79000)`, [addon.id])
check('addon raises quota', (await one('postgres', `select photo_quota q from public.events where id = $1`, [ev.id])).q === 503)
check('addon unlocks over-quota photos', (await one('postgres', `select over_quota from public.photos where id = $1`, [p5.id])).over_quota === false)

console.log('\n# upgrade & guards')
const upg = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'upgrade_classic_luxury', 550000) returning id`, [hostA.id, ev.id])
await expectErr('upgrade from wrong package rejected', as('service', `select public.fulfill_order($1, 'trx-3', 550000)`, [upg.id]), /butuh paket classic/)
check('failed fulfill left order pending', (await one('postgres', `select status from public.orders where id = $1`, [upg.id])).status === 'pending')
const tok = await one('service', `insert into public.orders (profile_id, organization_id, item_code, amount_idr) values ($1, $2, 'token_5', 1395000) returning id`, [hostA.id, org.id])
await expectErr('token pack not yet supported', as('service', `select public.fulfill_order($1, 'trx-4', 1395000)`, [tok.id]), /Fase 2/)

const classic = await one(hostA, `insert into public.events (slug, title) values ('classic-ev', 'Classic') returning id`)
const oc = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'classic', 149000) returning id`, [hostA.id, classic.id])
await as('service', `select public.fulfill_order($1, 'trx-5', 149000)`, [oc.id])
const gs2 = await one('service', `insert into public.guest_sessions (event_id, display_name, consent_version) values ($1, 'X', 'v1') returning id`, [classic.id])
await expectErr('classic event rejects photos', one('service', `insert into public.photos (event_id, guest_session_id, key_display, key_thumb, width, height, bytes_display)
  values ($1, $2, $3, $4, 10, 10, 10)`, [classic.id, gs2.id, `events/${classic.id}/a`, `events/${classic.id}/b`]), /tidak menerima foto/)
await expectErr('classic event cannot get staff links', as(hostA, `select public.create_staff_link($1, 'moderator')`, [classic.id]), /harus aktif/)
await as('service', `update public.guest_sessions set is_blocked = true where id = $1`, [gs.id])
await expectErr('blocked session rejected', insPhoto('p6'), /diblokir/)

check('active event cannot be deleted', (await as(hostA, `delete from public.events where id = $1 returning id`, [ev.id])).length === 0)
const draft = await one(hostA, `insert into public.events (slug, title) values ('draft-ev', 'Draft') returning id`)
check('draft event can be deleted', (await as(hostA, `delete from public.events where id = $1 returning id`, [draft.id])).length === 1)

console.log('\n# co-host & profiles')
check('outsider cannot see host profile', (await as(hostB, `select * from public.profiles where id = $1`, [hostA.id])).length === 0)
await expectErr('co-host cannot be inserted directly', as(hostA, `insert into public.event_cohosts (event_id, profile_id) values ($1, $2)`, [ev.id, hostB.id]), /permission denied/)
await expectErr('non-owner cannot create co-host invite', as(hostB, `select public.create_cohost_invite($1, 'x')`, [ev.id]), /akses ditolak/)
const invite = (await one(hostA, `select public.create_cohost_invite($1, '  Budi (mempelai pria)  ') r`, [ev.id])).r
const inviteRow = await one('postgres', `select * from public.cohost_invites where id = $1`, [invite.id])
check('invite stores only the token hash, label trimmed, 7 days', inviteRow.token_hash !== invite.token && inviteRow.token_hash.length === 64
  && inviteRow.label === 'Budi (mempelai pria)' && Math.round((new Date(inviteRow.expires_at) - new Date(inviteRow.created_at)) / 864e5) === 7)
await expectErr('anonymous device cannot preview invite', as(recDevice, `select public.cohost_invite_preview($1)`, [invite.token]), /akses ditolak/)
check('unknown token reveals nothing', JSON.stringify((await one(hostB, `select public.cohost_invite_preview('salah') r`)).r) === '{"status":"invalid"}')
const preview = (await one(hostB, `select public.cohost_invite_preview($1) r`, [invite.token])).r
check('invitee previews event and owner', preview.status === 'valid' && preview.event_title === 'Budi & Ani' && preview.owner_email === 'ani@x.id', JSON.stringify(preview))
check('owner opening own invite sees status owner', (await one(hostA, `select public.cohost_invite_preview($1) r`, [invite.token])).r.status === 'owner')
check('owner accepting own invite does not consume it', (await one(hostA, `select public.accept_cohost_invite($1) id`, [invite.token])).id === ev.id
  && (await one('postgres', `select accepted_at from public.cohost_invites where id = $1`, [invite.id])).accepted_at === null)
check('invitee accepts and becomes co-host', (await one(hostB, `select public.accept_cohost_invite($1) id`, [invite.token])).id === ev.id
  && (await one('postgres', `select accepted_by from public.cohost_invites where id = $1`, [invite.id])).accepted_by === hostB.id)
check('co-host reopening the link sees status member', (await one(hostB, `select public.cohost_invite_preview($1) r`, [invite.token])).r.status === 'member')
const latecomer = { id: await mkUser('telat@x.id') }
check('used invite shows status used', (await one(latecomer, `select public.cohost_invite_preview($1) r`, [invite.token])).r.status === 'used')
await expectErr('used invite cannot be reused', as(latecomer, `select public.accept_cohost_invite($1)`, [invite.token]), /tidak berlaku/)
await expectErr('co-host cannot create invites', as(hostB, `select public.create_cohost_invite($1, 'x')`, [ev.id]), /akses ditolak/)
check('co-host sees invite list', (await as(hostB, `select id, label from public.cohost_invites where event_id = $1`, [ev.id])).length === 1)
await expectErr('token hash is not readable', as(hostA, `select token_hash from public.cohost_invites`), /permission denied/)
const revoked = (await one(hostA, `select public.create_cohost_invite($1, '') r`, [ev.id])).r
await expectErr('co-host cannot revoke invites', as(hostB, `select public.revoke_cohost_invite($1)`, [revoked.id]), /tidak ditemukan/)
await as(hostA, `select public.revoke_cohost_invite($1)`, [revoked.id])
check('revoked invite shows status revoked', (await one(latecomer, `select public.cohost_invite_preview($1) r`, [revoked.token])).r.status === 'revoked')
await expectErr('revoked invite cannot be accepted', as(latecomer, `select public.accept_cohost_invite($1)`, [revoked.token]), /tidak berlaku/)
const expired = (await one(hostA, `select public.create_cohost_invite($1, '') r`, [ev.id])).r
await as('postgres', `update public.cohost_invites set expires_at = now() - interval '1 second' where id = $1`, [expired.id])
await expectErr('expired invite cannot be accepted', as(latecomer, `select public.accept_cohost_invite($1)`, [expired.token]), /tidak berlaku/)
const active = []
for (let i = 0; i < 5; i++) active.push((await one(hostA, `select public.create_cohost_invite($1, '') r`, [ev.id])).r)
await expectErr('at most 5 active invites', as(hostA, `select public.create_cohost_invite($1, '')`, [ev.id]), /maksimal 5/)
await as(latecomer, `select public.accept_cohost_invite($1)`, [active[0].token])
check('co-host cannot remove another co-host', (await as(hostB, `delete from public.event_cohosts where profile_id = $1 returning profile_id`, [latecomer.id])).length === 0)
check('co-host can leave the event', (await as(latecomer, `delete from public.event_cohosts where profile_id = auth.uid() returning profile_id`)).length === 1)
await as(latecomer, `select public.accept_cohost_invite($1)`, [active[1].token])
check('owner can remove a co-host', (await as(hostA, `delete from public.event_cohosts where profile_id = $1 returning profile_id`, [latecomer.id])).length === 1)
check('removed co-host loses access', (await as(latecomer, `select * from public.events where id = $1`, [ev.id])).length === 0)
check('co-host sees event', (await as(hostB, `select * from public.events where id = $1`, [ev.id])).length === 1)
check('co-host sees invitations', (await as(hostB, `select * from public.invitations`)).length === 5)
check('co-host sees owner profile', (await as(hostB, `select * from public.profiles where id = $1`, [hostA.id])).length === 1)
check('owner sees co-host profile', (await as(hostA, `select * from public.profiles where id = $1`, [hostB.id])).length === 1)
check('admin sees everything', (await as(admin, `select * from public.events`)).length === 2)

console.log('\n# account deletion')
const leaver = { id: await mkUser('leaver@x.id') }
const leaverEvent = await one(leaver, `insert into public.events (slug, title) values ('leaver-ev', 'Leaver') returning id`)
const leaverOrder = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'classic', 149000) returning id`, [leaver.id, leaverEvent.id])
await as('postgres', `delete from public.events where id = $1`, [leaverEvent.id])
await as('postgres', `delete from auth.users where id = $1`, [leaver.id])
const kept = await one('postgres', `select profile_id, event_id, amount_idr from public.orders where id = $1`, [leaverOrder.id])
check('user with orders can be deleted; order kept without profile', kept && kept.profile_id === null && kept.event_id === null && Number(kept.amount_idr) === 149000)

console.log('\n# rate limit')
const hits = []
for (let i = 0; i < 4; i++) hits.push((await one('service', `select public.hit_rate_limit('rsvp:test', 3, 600) ok`)).ok)
check('allows up to the limit, then blocks', JSON.stringify(hits) === JSON.stringify([true, true, true, false]), JSON.stringify(hits))
check('other keys are independent', (await one('service', `select public.hit_rate_limit('rsvp:other', 3, 600) ok`)).ok === true)
await as('postgres', `update public.rate_limit_hits set created_at = now() - interval '11 minutes' where key = 'rsvp:test'`)
check('window expiry frees the key', (await one('service', `select public.hit_rate_limit('rsvp:test', 3, 600) ok`)).ok === true)
await expectErr('authenticated cannot call hit_rate_limit', as(hostA, `select public.hit_rate_limit('x', 1, 60)`), /permission denied/)
await expectErr('anon cannot read rate_limit_hits', as('anon', `select * from public.rate_limit_hits`), /permission denied/)

console.log('\n# gallery passcode, downloads, reports')
// hostB sudah menjadi co-host di atas, jadi pakai user luar yang baru.
const outsider = { id: await mkUser('luar@x.id') }
await as(hostA, `select public.set_gallery_passcode($1, 'mawar123')`, [ev.id])
const hash = (await one('postgres', `select passcode_hash from public.events where id = $1`, [ev.id])).passcode_hash
check('passcode stored as bcrypt hash', hash && hash.startsWith('$2') && !hash.includes('mawar123'))
check('right passcode accepted', (await one('service', `select public.check_gallery_passcode($1, 'mawar123') ok`, [ev.id])).ok === true)
check('wrong passcode rejected', (await one('service', `select public.check_gallery_passcode($1, 'melati') ok`, [ev.id])).ok === false)
await expectErr('authenticated cannot check passcodes', as(hostA, `select public.check_gallery_passcode($1, 'x')`, [ev.id]), /permission denied/)
await expectErr('outsider cannot set passcode', as(outsider, `select public.set_gallery_passcode($1, 'abcd')`, [ev.id]), /akses ditolak/)
await expectErr('passcode too short', as(hostA, `select public.set_gallery_passcode($1, 'ab')`, [ev.id]), /4 sampai 32/)
await as(hostA, `select public.set_gallery_passcode($1, '')`, [ev.id])
check('empty passcode clears it', (await one('postgres', `select passcode_hash from public.events where id = $1`, [ev.id])).passcode_hash === null)
check('no passcode -> check false', (await one('service', `select public.check_gallery_passcode($1, '') ok`, [ev.id])).ok === false)

const manifest = await as(photoDevice, `select * from public.staff_download_manifest($1)`, [ev.id])
const approvedFree = (await one('postgres', `select count(*)::int n from public.photos where event_id = $1 and status = 'approved' and not over_quota`, [ev.id])).n
check('photographer manifest = approved photos within quota', manifest.length === approvedFree && manifest.length > 0 && manifest.every((m) => m.key.startsWith(`events/${ev.id}/`)), `${manifest.length} vs ${approvedFree}`)
check('manifest is paginated', (await as(photoDevice, `select * from public.staff_download_manifest($1, 'display', 1, 2)`, [ev.id])).length === Math.min(2, approvedFree - 1))
await expectErr('originals only for Luxury', as(photoDevice, `select * from public.staff_download_manifest($1, 'original')`, [ev.id]), /Luxury/)
await expectErr('moderator cannot download', as(modDevice, `select * from public.staff_download_manifest($1)`, [ev.id]), /akses ditolak/)
const summary = (await one(hostA, `select public.staff_gallery_summary($1) s`, [ev.id])).s
check('gallery summary counts', summary.downloadable === approvedFree && summary.locked === 0 && summary.package === 'complete', JSON.stringify(summary))

const report = await one('service', `insert into public.photo_reports (event_id, photo_id, reason, reporter_key) values ($1, $2, 'privacy', 'ip-1') returning id`, [ev.id, p3.id])
await expectErr('same reporter cannot report twice', one('service', `insert into public.photo_reports (event_id, photo_id, reason, reporter_key) values ($1, $2, 'other', 'ip-1')`, [ev.id, p3.id]), /duplicate key/)
check('host sees reports', (await as(hostA, `select * from public.photo_reports`)).length === 1)
check('outsider sees no reports', (await as(outsider, `select * from public.photo_reports`)).length === 0)
await expectErr('authenticated cannot create reports', as(hostA, `insert into public.photo_reports (event_id, photo_id, reason, reporter_key) values ($1, $2, 'other', 'x')`, [ev.id, p3.id]), /permission denied/)
check('host resolves report', (await as(hostA, `update public.photo_reports set resolved_at = now() where id = $1 returning id`, [report.id])).length === 1)
await expectErr('host cannot change report reason', as(hostA, `update public.photo_reports set reason = 'other' where id = $1`, [report.id]), /permission denied/)

const orphan = (await one('postgres', `insert into auth.users (is_anonymous, created_at) values (true, now() - interval '8 days') returning id`)).id
const keeper = (await one('postgres', `insert into auth.users (is_anonymous, created_at) values (true, now() - interval '8 days') returning id`)).id
await as('postgres', `insert into public.staff_sessions (auth_user_id, staff_link_id) values ($1, $2)`, [keeper, links.photographer.id])
const cleaned = (await one('service', `select public.cleanup_staff_devices() n`)).n
const remaining = (await as('postgres', `select id from auth.users where id = any($1::uuid[])`, [[orphan, keeper]])).map((r) => r.id)
check('cleanup removes only old anonymous devices without an active link', cleaned === 1 && remaining.length === 1 && remaining[0] === keeper, `cleaned=${cleaned}`)
check('recent staff devices untouched', (await one('postgres', `select count(*)::int n from auth.users where id = any($1::uuid[])`, [[recDevice.id, modDevice.id, photoDevice.id]])).n === 3)
await expectErr('authenticated cannot run cleanup', as(hostA, `select public.cleanup_staff_devices()`), /permission denied/)

console.log('\n# super admin')
await expectErr('host cannot open admin monitor', as(hostA, `select * from public.admin_today()`), /akses ditolak/)
await expectErr('host cannot activate events', as(hostA, `select public.admin_activate_event($1, 'luxury', 'coba aktivasi')`, [ev.id]), /akses ditolak/)

const pilot = await one(hostA, `insert into public.events (slug, title) values ('pilot-ev', 'Pilot') returning id`)
const act = (await one(admin, `select public.admin_activate_event($1, 'complete', 'Acara pilot gratis') r`, [pilot.id])).r
const pilotRow = await one('postgres', `select status, package, photo_quota from public.events where id = $1`, [pilot.id])
check('admin activates draft event with catalog quota', act.ok && pilotRow.status === 'active' && pilotRow.package === 'complete' && pilotRow.photo_quota === 1000)
await expectErr('activation cannot downgrade', as(admin, `select public.admin_activate_event($1, 'classic', 'turun paket')`, [pilot.id]), /naik paket/)
await expectErr('reason is required', as(admin, `select public.admin_activate_event($1, 'luxury', 'x')`, [pilot.id]), /check constraint/)
check('upgrade to luxury allowed', (await one(admin, `select public.admin_activate_event($1, 'luxury', 'Upgrade pilot ke Luxury') r`, [pilot.id])).r.ok)

// Acara hari ini: sesi mulai sekarang, ada foto, kegagalan upload, check-in, laporan, dan detak layar panggung.
await as('postgres', `update public.events set published_at = now() where id = $1`, [pilot.id])
await as('postgres', `insert into public.event_sessions (event_id, name, starts_at, ends_at) values ($1, 'Resepsi', now(), now() + interval '3 hours')`, [pilot.id])
const pilotGs = await one('service', `insert into public.guest_sessions (event_id, display_name, consent_version) values ($1, 'Rani', 'v1') returning id`, [pilot.id])
const pilotPhoto = await one('service', `insert into public.photos (event_id, guest_session_id, key_display, key_thumb, width, height, bytes_display)
  values ($1, $2, $3, $4, 10, 10, 10) returning id, status`, [pilot.id, pilotGs.id, `events/${pilot.id}/a.webp`, `events/${pilot.id}/b.webp`])
await as('service', `insert into public.upload_errors (event_id, stage, code) values ($1, 'confirm', 'upload_missing')`, [pilot.id])
await as('service', `insert into public.photo_reports (event_id, photo_id, reason, reporter_key) values ($1, $2, 'privacy', 'ip-9')`, [pilot.id, pilotPhoto.id])
await as(hostA, `select public.staff_stage_heartbeat($1, true, 12)`, [pilot.id])
await expectErr('receptionist cannot send stage heartbeat', as(recDevice, `select public.staff_stage_heartbeat($1, true, 1)`, [ev.id]), /akses ditolak/)
const today = await as(admin, `select * from public.admin_today()`)
const row = today.find((t) => t.event_id === pilot.id)
check('monitor lists today\'s event with metrics', row && row.photos_today === 1 && row.pending === 1 && row.upload_errors_today === 1
  && row.open_reports === 1 && row.stage_live === true && row.stage_cached === 12 && row.sessions.length === 1, JSON.stringify(row))
check('events without a session today are not listed', !today.some((t) => t.event_id === ev.id))

const takedown = (await one(admin, `select public.admin_takedown_photo($1, 'Laporan privasi tamu') r`, [pilotPhoto.id])).r
const gone = await one('postgres', `select status from public.photos where id = $1`, [pilotPhoto.id])
check('takedown deletes photo, returns R2 keys, resolves reports', takedown.ok && gone.status === 'deleted' && takedown.keys.length === 2
  && (await one('postgres', `select count(*)::int n from public.photo_reports where photo_id = $1 and resolved_at is null`, [pilotPhoto.id])).n === 0)

const refundOrder = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'addon_photos_500', 79000) returning id`, [hostA.id, pilot.id])
await expectErr('pending order cannot be refunded', as(admin, `select public.admin_record_refund($1, 'Salah bayar')`, [refundOrder.id]), /hanya order lunas/)
await as('service', `select public.fulfill_order($1, 'trx-refund', 79000)`, [refundOrder.id])
check('admin records refund', (await one(admin, `select public.admin_record_refund($1, 'Host membatalkan add-on') r`, [refundOrder.id])).r.ok
  && (await one('postgres', `select status from public.orders where id = $1`, [refundOrder.id])).status === 'refunded')
const revertEv = await one(hostA, `insert into public.events (slug, title) values ('refund-ev', 'Refund') returning id`)
const revertOrder = await one('service', `insert into public.orders (profile_id, event_id, item_code, amount_idr) values ($1, $2, 'classic', 149000) returning id`, [hostA.id, revertEv.id])
await as('service', `select public.fulfill_order($1, 'trx-revert', 149000)`, [revertOrder.id])
await as(admin, `select public.admin_record_refund($1, 'Refund sebelum publikasi', true)`, [revertOrder.id])
const reverted = await one('postgres', `select status, package, published_at from public.events where id = $1`, [revertEv.id])
check('refund with revert returns event to draft', reverted.status === 'draft' && reverted.package === null && reverted.published_at === null)

const adj = (await one(admin, `select public.admin_adjust_credit($1, 5, 'Bonus pilot WO') r`, [org.id])).r
check('credit adjustment recorded in ledger', adj.balance === 5
  && (await one('postgres', `select count(*)::int n from public.credit_ledger where organization_id = $1 and reason = 'adjustment' and actor_id = $2`, [org.id, admin.id])).n === 1)
await expectErr('zero adjustment rejected', as(admin, `select public.admin_adjust_credit($1, 0, 'tidak ada')`, [org.id]), /tidak boleh 0/)

await expectErr('custom domain only for Luxury', as(admin, `select public.admin_upsert_domain('budi-ani.com', $1, 'platform', '2027-09-27', 'Domain paket')`, [ev.id]), /Luxury/)
const domainId = (await one(admin, `select public.admin_upsert_domain('Pilot-Wedding.com', $1, 'platform', '2027-09-27', 'Domain paket Luxury') id`, [pilot.id])).id
check('pending domain does not resolve', (await one('anon', `select public.resolve_custom_domain('pilot-wedding.com') s`)).s === null)
await as(admin, `select public.admin_set_domain_status($1, 'active', 'DNS sudah mengarah ke Vercel')`, [domainId])
check('active domain resolves to event slug (host lowercased, port ignored)', (await one('anon', `select public.resolve_custom_domain('PILOT-wedding.com:443') s`)).s === 'pilot-ev')
check('audit log has every successful admin action with actor (rejected ones are not logged)', (await as(admin, `select action from public.admin_actions where actor_id = $1`, [admin.id])).length === 8)
check('hosts cannot read audit log', (await as(hostA, `select * from public.admin_actions`)).length === 0)
const dismissPhoto = await one('service', `insert into public.photos (event_id, guest_session_id, key_display, key_thumb, width, height, bytes_display)
  values ($1, $2, $3, $4, 10, 10, 10) returning id`, [pilot.id, pilotGs.id, `events/${pilot.id}/c.webp`, `events/${pilot.id}/d.webp`])
const dismissReport = await one('service', `insert into public.photo_reports (event_id, photo_id, reason, reporter_key) values ($1, $2, 'other', 'ip-8') returning id`, [pilot.id, dismissPhoto.id])
await expectErr('host cannot dismiss via admin RPC', as(hostA, `select public.admin_dismiss_report($1, 'bukan masalah')`, [dismissReport.id]), /akses ditolak/)
await as(admin, `select public.admin_dismiss_report($1, 'Foto tidak melanggar')`, [dismissReport.id])
check('admin dismisses report, photo stays', (await one('postgres', `select resolved_at from public.photo_reports where id = $1`, [dismissReport.id])).resolved_at !== null
  && (await one('postgres', `select status from public.photos where id = $1`, [dismissPhoto.id])).status === 'pending')
await expectErr('dismissing twice fails', as(admin, `select public.admin_dismiss_report($1, 'Foto tidak melanggar')`, [dismissReport.id]), /sudah ditutup/)
await as('service', `select public.cleanup_ops_data()`)
check('cleanup keeps recent ops data', (await one('postgres', `select count(*)::int n from public.upload_errors`)).n === 1)

console.log('\n# revocation')
await as(hostA, `update public.staff_links set revoked_at = now() where id = $1`, [links.receptionist.id])
await expectErr('revoked link loses access', as(recDevice, `select * from public.staff_guest_list($1)`, [ev.id]), /akses ditolak/)
check('revoked staff no longer receives channel', (await as(recDevice, `select * from realtime.messages`, [], topic)).length === 0)
await as('postgres', `update public.staff_links set expires_at = now() - interval '1 second' where id = $1`, [links.moderator.id])
await expectErr('expired link loses access', as(modDevice, `select * from public.staff_photos($1)`, [ev.id]), /akses ditolak/)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
