/**
 * SN Sergio Nxobei the Barber — web server
 * Zero dependencies. Run:  node server.js
 *
 *   Customer site : http://localhost:3000/
 *   Admin panel   : http://localhost:3000/admin/
 *
 * Both sides read/write the same data file (data/db.json) through this API,
 * so a booking made on the customer side appears in the admin panel instantly.
 *
 * Env vars:  PORT (default 3000), ADMIN_PASSWORD (only used the first time, to create db.json)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // admin-uploaded photos live next to the database
const BEHIND_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.RAILWAY_ENVIRONMENT;
const TZ = 'Africa/Johannesburg';
const MAX_BODY = 8 * 1024 * 1024; // 8MB (photo uploads arrive as base64)

/* ------------------------------------------------------------------ */
/* Password hashing                                                    */
/* ------------------------------------------------------------------ */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const test = crypto.scryptSync(String(password), rec.salt, 64);
  const real = Buffer.from(rec.hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}

/* ------------------------------------------------------------------ */
/* Database (JSON file, atomic writes)                                 */
/* ------------------------------------------------------------------ */
function uid(prefix) {
  return prefix + crypto.randomBytes(5).toString('hex');
}

function seedDb() {
  const initialPassword = process.env.ADMIN_PASSWORD || 'sergio2026';
  const pw = hashPassword(initialPassword);
  const files = fs.readdirSync(path.join(ROOT, 'images', 'gallery')).filter(f => /^cut-\d+\.jpg$/.test(f)).sort();
  const gallery = files.map((f, i) => ({
    id: uid('g'),
    src: '/images/gallery/' + f,
    caption: 'Fresh cut ' + (i + 1),
    visible: true
  }));
  const hours = {
    // 0 = Sunday ... 6 = Saturday
    0: { closed: true, open: '09:00', close: '14:00' },
    1: { closed: false, open: '08:00', close: '18:00' },
    2: { closed: false, open: '08:00', close: '18:00' },
    3: { closed: false, open: '08:00', close: '18:00' },
    4: { closed: false, open: '08:00', close: '18:00' },
    5: { closed: false, open: '08:00', close: '19:00' },
    6: { closed: false, open: '08:00', close: '19:00' }
  };
  return {
    version: 1,
    admin: { salt: pw.salt, hash: pw.hash, mustChange: !process.env.ADMIN_PASSWORD },
    settings: {
      businessName: 'Sergio Nxobei The Barber',
      shortName: 'SN',
      tagline: 'Sharp cuts. Clean fades. Crowned in gold.',
      phone: '+27 78 473 7295',
      whatsapp: '27784737295',
      location: 'Khayelitsha Site B',
      areaNote: 'House calls available anywhere around Cape Town',
      slotMinutes: 30,
      chairs: 1,
      maxAdvanceDays: 30,
      closedDates: [],
      hours,
      announcement: ''
    },
    services: [
      { id: 'svc-fades', name: 'Fades', price: 50, active: true, houseCall: false, desc: 'Clean, blended fade' },
      { id: 'svc-hightop', name: 'High Top', price: 60, active: true, houseCall: false, desc: 'Sculpted high-top' },
      { id: 'svc-taper', name: 'Taper Fades', price: 60, active: true, houseCall: false, desc: 'Natural taper, sharp edges' },
      { id: 'svc-mohawk', name: 'Mohawk', price: 60, active: true, houseCall: false, desc: 'Bold mohawk styles' },
      { id: 'svc-kleva', name: 'Kleva Cut', price: 50, active: true, houseCall: false, desc: 'Kleva cut, neat finish' },
      { id: 'svc-brush', name: 'Brush Cut', price: 40, active: true, houseCall: false, desc: 'Short, even brush cut' },
      { id: 'svc-chizkop', name: 'Chizkop', price: 40, active: true, houseCall: false, desc: 'Classic all-over chizkop' },
      { id: 'svc-ladies', name: 'Ladies Cut', price: 60, active: true, houseCall: false, desc: 'Precision cuts for ladies' },
      { id: 'svc-dye', name: 'Cut & Dye', price: 120, active: true, houseCall: false, desc: 'Cut plus colour' },
      { id: 'svc-house', name: 'House Call', price: 200, active: true, houseCall: true, desc: 'Sergio comes to you, anywhere around Cape Town' }
    ],
    gallery,
    bookings: []
  };
}

let DB;
function loadDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    DB = seedDb();
    saveDb();
    console.log('\n  First run: created data/db.json');
    if (process.env.ADMIN_PASSWORD) {
      console.log('  Admin password set from ADMIN_PASSWORD.');
    } else {
      console.log('  Default admin password: sergio2026  (you will be asked to change it after login)');
    }
    return;
  }
  DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ------------------------------------------------------------------ */
/* Time helpers (South Africa time)                                    */
/* ------------------------------------------------------------------ */
function nowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  const hh = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hh}:${get('minute')}` };
}
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function dayOfWeek(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fromMin(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function slotsForDate(date) {
  const s = DB.settings;
  const h = s.hours[dayOfWeek(date)];
  if (!h || h.closed) return { closed: true, reason: 'Closed on this day', slots: [] };
  if (s.closedDates.includes(date)) return { closed: true, reason: 'Closed on this date', slots: [] };
  const step = Math.max(10, s.slotMinutes || 30);
  const start = toMin(h.open), end = toMin(h.close);
  const out = [];
  for (let m = start; m + step <= end; m += step) out.push(fromMin(m));
  return { closed: false, slots: out };
}
function activeCount(date, time) {
  return DB.bookings.filter(b => b.date === date && b.time === time &&
    (b.status === 'pending' || b.status === 'confirmed')).length;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const sessions = new Map(); // token -> expiry
const SESSION_MS = 12 * 60 * 60 * 1000;
const hits = new Map();     // rate limit buckets

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  for (const [k, v] of hits) { const f = v.filter(t => now - t < 3600000); f.length ? hits.set(k, f) : hits.delete(k); }
}, 10 * 60 * 1000).unref();

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const tok = parseCookies(req).sn_admin;
  if (!tok) return false;
  const exp = sessions.get(tok);
  if (!exp || exp < Date.now()) { sessions.delete(tok); return false; }
  return true;
}
function clientIp(req) {
  if (BEHIND_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    if (xf) return xf; // last hop = the address the platform proxy saw
  }
  return req.socket.remoteAddress || 'unknown';
}
function isHttps(req) { return !!req.socket.encrypted || (BEHIND_PROXY && req.headers['x-forwarded-proto'] === 'https'); }

function send(res, status, body, headers) {
  const h = Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  }, headers || {});
  if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
    h['Content-Type'] = 'application/json; charset=utf-8';
    h['Cache-Control'] = 'no-store';
    body = JSON.stringify(body);
  }
  res.writeHead(status, h);
  res.end(body);
}
const fail = (res, status, message) => send(res, status, { error: message });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function publicSettings() {
  const s = DB.settings;
  return {
    businessName: s.businessName, shortName: s.shortName, tagline: s.tagline,
    phone: s.phone, whatsapp: s.whatsapp, location: s.location, areaNote: s.areaNote,
    slotMinutes: s.slotMinutes, maxAdvanceDays: s.maxAdvanceDays, hours: s.hours,
    closedDates: s.closedDates, announcement: s.announcement
  };
}

/* ------------------------------------------------------------------ */
/* Booking validation / creation                                       */
/* ------------------------------------------------------------------ */
function buildBooking(input, adminMode) {
  const name = clean(input.name, 60);
  const phoneRaw = clean(input.phone, 25);
  const digits = phoneRaw.replace(/\D/g, '');
  if (name.length < 2) return { error: 'Please enter your name.' };
  if (digits.length < 9 || digits.length > 15) return { error: 'Please enter a valid phone number.' };

  const svc = DB.services.find(x => x.id === input.serviceId && (adminMode || x.active));
  if (!svc) return { error: 'Please choose a service.' };

  const date = clean(input.date, 10), time = clean(input.time, 5);
  if (!isValidDate(date)) return { error: 'Please choose a valid date.' };

  const now = nowParts();
  if (!adminMode) {
    if (date < now.date) return { error: 'That date has already passed.' };
    if (date > addDays(now.date, DB.settings.maxAdvanceDays || 30)) return { error: 'That date is too far ahead.' };
  }
  const day = slotsForDate(date);
  if (!adminMode) {
    if (day.closed) return { error: day.reason };
    if (!day.slots.includes(time)) return { error: 'Please choose an available time.' };
    if (date === now.date && toMin(time) < toMin(now.time) + 15) return { error: 'That time is too soon. Please pick a later slot.' };
  } else if (!/^\d{2}:\d{2}$/.test(time)) {
    return { error: 'Please enter a valid time.' };
  }
  if (activeCount(date, time) >= (DB.settings.chairs || 1)) {
    return { error: 'Sorry, that time was just taken. Please pick another.' };
  }

  const address = clean(input.address, 200);
  if (svc.houseCall && address.length < 5) return { error: 'Please enter your address for the house call.' };

  const ref = 'SN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  return {
    booking: {
      id: uid('b'), ref, name, phone: phoneRaw, serviceId: svc.id, serviceName: svc.name,
      price: svc.price, houseCall: !!svc.houseCall, address: svc.houseCall ? address : '',
      date, time, notes: clean(input.notes, 300),
      status: adminMode && input.status === 'confirmed' ? 'confirmed' : 'pending',
      source: adminMode ? 'admin' : 'website',
      createdAt: new Date().toISOString()
    }
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */
const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  // state-changing requests must be JSON (blocks simple cross-site form posts)
  if (m !== 'GET' && m !== 'HEAD') {
    const ct = (req.headers['content-type'] || '');
    if (!ct.includes('application/json')) return fail(res, 415, 'JSON required');
  }

  /* ---------- public ---------- */
  if (m === 'GET' && p === '/api/public') {
    return send(res, 200, {
      settings: publicSettings(),
      services: DB.services.filter(s => s.active).map(({ id, name, price, desc, houseCall }) => ({ id, name, price, desc, houseCall })),
      gallery: DB.gallery.filter(g => g.visible).map(({ id, src, caption }) => ({ id, src, caption })),
      today: nowParts().date
    });
  }

  if (m === 'GET' && p === '/api/slots') {
    const date = url.searchParams.get('date') || '';
    if (!isValidDate(date)) return fail(res, 400, 'Invalid date');
    const now = nowParts();
    if (date < now.date || date > addDays(now.date, DB.settings.maxAdvanceDays || 30)) {
      return send(res, 200, { closed: true, reason: 'Date out of range', slots: [] });
    }
    const day = slotsForDate(date);
    if (day.closed) return send(res, 200, day);
    const chairs = DB.settings.chairs || 1;
    return send(res, 200, {
      closed: false,
      slots: day.slots.map(t => ({
        time: t,
        available: activeCount(date, t) < chairs && !(date === now.date && toMin(t) < toMin(now.time) + 15)
      }))
    });
  }

  if (m === 'POST' && p === '/api/bookings') {
    if (!rateLimit('book:' + clientIp(req), 6, 10 * 60 * 1000)) return fail(res, 429, 'Too many requests. Please try again in a few minutes.');
    const body = await readJson(req);
    if (body.website) return send(res, 200, { ok: true }); // honeypot
    const r = buildBooking(body, false);
    if (r.error) return fail(res, 400, r.error);
    DB.bookings.push(r.booking);
    saveDb();
    const b = r.booking;
    return send(res, 201, { ok: true, booking: { ref: b.ref, name: b.name, serviceName: b.serviceName, price: b.price, date: b.date, time: b.time, houseCall: b.houseCall, address: b.address } });
  }

  /* ---------- admin auth ---------- */
  if (m === 'POST' && p === '/api/admin/login') {
    if (!rateLimit('login:' + clientIp(req), 8, 10 * 60 * 1000)) return fail(res, 429, 'Too many attempts. Try again later.');
    const body = await readJson(req);
    if (!verifyPassword(body.password || '', DB.admin)) return fail(res, 401, 'Wrong password');
    const tok = crypto.randomBytes(32).toString('hex');
    sessions.set(tok, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true, mustChange: !!DB.admin.mustChange }, {
      'Set-Cookie': `sn_admin=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? '; Secure' : ''}`
    });
  }
  if (m === 'POST' && p === '/api/admin/logout') {
    const tok = parseCookies(req).sn_admin;
    if (tok) sessions.delete(tok);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sn_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (!p.startsWith('/api/admin/')) return fail(res, 404, 'Not found');
  if (!isAdmin(req)) return fail(res, 401, 'Not logged in');

  /* ---------- admin: everything below needs a session ---------- */
  if (m === 'GET' && p === '/api/admin/state') {
    return send(res, 200, {
      settings: DB.settings, services: DB.services, gallery: DB.gallery,
      bookings: DB.bookings, mustChange: !!DB.admin.mustChange, now: nowParts()
    });
  }

  if (m === 'POST' && p === '/api/admin/password') {
    const b = await readJson(req);
    if (!verifyPassword(b.current || '', DB.admin)) return fail(res, 400, 'Current password is wrong');
    const next = String(b.next || '');
    if (next.length < 8) return fail(res, 400, 'New password must be at least 8 characters');
    const h = hashPassword(next);
    DB.admin = { salt: h.salt, hash: h.hash, mustChange: false };
    saveDb();
    return send(res, 200, { ok: true });
  }

  // bookings
  if (m === 'POST' && p === '/api/admin/bookings') {
    const r = buildBooking(await readJson(req), true);
    if (r.error) return fail(res, 400, r.error);
    DB.bookings.push(r.booking); saveDb();
    return send(res, 201, { ok: true, booking: r.booking });
  }
  let mm = p.match(/^\/api\/admin\/bookings\/([\w-]+)$/);
  if (mm) {
    const idx = DB.bookings.findIndex(b => b.id === mm[1]);
    if (idx < 0) return fail(res, 404, 'Booking not found');
    if (m === 'PATCH') {
      const body = await readJson(req);
      const b = DB.bookings[idx];
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return fail(res, 400, 'Bad status');
        if ((body.status === 'pending' || body.status === 'confirmed') && !(b.status === 'pending' || b.status === 'confirmed') &&
            activeCount(b.date, b.time) >= (DB.settings.chairs || 1)) {
          return fail(res, 409, 'Another booking already holds that time slot.');
        }
        b.status = body.status;
      }
      if (body.adminNote !== undefined) b.adminNote = clean(body.adminNote, 300);
      saveDb();
      return send(res, 200, { ok: true, booking: b });
    }
    if (m === 'DELETE') { DB.bookings.splice(idx, 1); saveDb(); return send(res, 200, { ok: true }); }
  }

  // services
  if (m === 'POST' && p === '/api/admin/services') {
    const b = await readJson(req);
    const name = clean(b.name, 40); const price = Number(b.price);
    if (!name) return fail(res, 400, 'Name required');
    if (!isFinite(price) || price < 0 || price > 100000) return fail(res, 400, 'Valid price required');
    const svc = { id: uid('svc-'), name, price: Math.round(price), active: b.active !== false, houseCall: !!b.houseCall, desc: clean(b.desc, 120) };
    DB.services.push(svc); saveDb();
    return send(res, 201, { ok: true, service: svc });
  }
  mm = p.match(/^\/api\/admin\/services\/([\w-]+)$/);
  if (mm) {
    const idx = DB.services.findIndex(s => s.id === mm[1]);
    if (idx < 0) return fail(res, 404, 'Service not found');
    if (m === 'PATCH') {
      const b = await readJson(req); const s = DB.services[idx];
      if (b.name !== undefined) { const n = clean(b.name, 40); if (!n) return fail(res, 400, 'Name required'); s.name = n; }
      if (b.price !== undefined) { const pr = Number(b.price); if (!isFinite(pr) || pr < 0 || pr > 100000) return fail(res, 400, 'Valid price required'); s.price = Math.round(pr); }
      if (b.desc !== undefined) s.desc = clean(b.desc, 120);
      if (b.active !== undefined) s.active = !!b.active;
      if (b.houseCall !== undefined) s.houseCall = !!b.houseCall;
      saveDb();
      return send(res, 200, { ok: true, service: s });
    }
    if (m === 'DELETE') { DB.services.splice(idx, 1); saveDb(); return send(res, 200, { ok: true }); }
  }
  if (m === 'POST' && p === '/api/admin/services/reorder') {
    const b = await readJson(req);
    if (!Array.isArray(b.ids)) return fail(res, 400, 'ids required');
    const map = new Map(DB.services.map(s => [s.id, s]));
    const next = b.ids.map(id => map.get(id)).filter(Boolean);
    DB.services.forEach(s => { if (!next.includes(s)) next.push(s); });
    DB.services = next; saveDb();
    return send(res, 200, { ok: true });
  }

  // gallery
  if (m === 'POST' && p === '/api/admin/gallery') {
    const b = await readJson(req);
    const mt = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
    if (!mt) return fail(res, 400, 'Please upload a JPG, PNG or WebP image');
    const buf = Buffer.from(mt[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return fail(res, 400, 'Image is too large (max 6MB)');
    const ext = mt[1] === 'jpeg' ? 'jpg' : mt[1];
    const file = 'up-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
    const item = { id: uid('g'), src: '/uploads/' + file, caption: clean(b.caption, 60) || 'New cut', visible: true };
    DB.gallery.unshift(item); saveDb();
    return send(res, 201, { ok: true, item });
  }
  mm = p.match(/^\/api\/admin\/gallery\/([\w-]+)$/);
  if (mm) {
    const idx = DB.gallery.findIndex(g => g.id === mm[1]);
    if (idx < 0) return fail(res, 404, 'Photo not found');
    if (m === 'PATCH') {
      const b = await readJson(req); const g = DB.gallery[idx];
      if (b.caption !== undefined) g.caption = clean(b.caption, 60);
      if (b.visible !== undefined) g.visible = !!b.visible;
      if (b.move === 'up' && idx > 0) { [DB.gallery[idx - 1], DB.gallery[idx]] = [DB.gallery[idx], DB.gallery[idx - 1]]; }
      if (b.move === 'down' && idx < DB.gallery.length - 1) { [DB.gallery[idx + 1], DB.gallery[idx]] = [DB.gallery[idx], DB.gallery[idx + 1]]; }
      saveDb();
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      const g = DB.gallery[idx];
      DB.gallery.splice(idx, 1); saveDb();
      const base = path.basename(g.src);
      if (base.startsWith('up-')) {
        const dir = g.src.startsWith('/uploads/') ? UPLOAD_DIR : path.join(ROOT, 'images', 'gallery'); // older uploads lived in images/gallery
        fs.unlink(path.join(dir, base), () => {});
      }
      return send(res, 200, { ok: true });
    }
  }

  // settings
  if (m === 'PUT' && p === '/api/admin/settings') {
    const b = await readJson(req); const s = DB.settings;
    ['businessName', 'tagline', 'location', 'areaNote', 'phone', 'announcement'].forEach(k => {
      if (b[k] !== undefined) s[k] = clean(b[k], k === 'announcement' || k === 'tagline' || k === 'areaNote' ? 160 : 60);
    });
    if (b.whatsapp !== undefined) s.whatsapp = String(b.whatsapp).replace(/\D/g, '').slice(0, 15);
    if (b.slotMinutes !== undefined) { const n = parseInt(b.slotMinutes, 10); if (![15, 20, 30, 45, 60].includes(n)) return fail(res, 400, 'Bad slot length'); s.slotMinutes = n; }
    if (b.chairs !== undefined) { const n = parseInt(b.chairs, 10); if (!(n >= 1 && n <= 10)) return fail(res, 400, 'Chairs must be 1-10'); s.chairs = n; }
    if (b.maxAdvanceDays !== undefined) { const n = parseInt(b.maxAdvanceDays, 10); if (!(n >= 1 && n <= 90)) return fail(res, 400, 'Advance days must be 1-90'); s.maxAdvanceDays = n; }
    if (b.hours) {
      for (let d = 0; d < 7; d++) {
        const h = b.hours[d]; if (!h) continue;
        if (!/^\d{2}:\d{2}$/.test(h.open) || !/^\d{2}:\d{2}$/.test(h.close)) return fail(res, 400, 'Bad opening hours');
        if (!h.closed && toMin(h.open) >= toMin(h.close)) return fail(res, 400, 'Closing time must be after opening time');
        s.hours[d] = { closed: !!h.closed, open: h.open, close: h.close };
      }
    }
    if (Array.isArray(b.closedDates)) s.closedDates = [...new Set(b.closedDates.filter(isValidDate))].sort();
    saveDb();
    return send(res, 200, { ok: true, settings: s });
  }

  return fail(res, 404, 'Not found');
}

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  let base, rel;
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (p.startsWith('/admin/')) { base = path.join(ROOT, 'admin'); rel = p.slice('/admin/'.length); }
  else if (p.startsWith('/uploads/')) { base = UPLOAD_DIR; rel = p.slice('/uploads/'.length); }
  else if (p.startsWith('/images/')) { base = path.join(ROOT, 'images'); rel = p.slice('/images/'.length); }
  else if (p.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = p.slice('/shared/'.length); }
  else { base = path.join(ROOT, 'customer'); rel = p.slice(1); }
  if (!rel || rel.endsWith('/')) rel += 'index.html';

  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return fail(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const isImg = file.includes(path.sep + 'images' + path.sep) || base === UPLOAD_DIR;
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': isImg ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (base.endsWith(path.sep + 'admin')) { headers['X-Frame-Options'] = 'DENY'; headers['X-Robots-Tag'] = 'noindex, nofollow'; }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */
loadDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
    return serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) fail(res, status, status === 500 ? 'Server error' : e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  SN Sergio Nxobei The Barber`);
  console.log(`  Customer site : http://localhost:${PORT}/`);
  console.log(`  Admin panel   : http://localhost:${PORT}/admin/\n`);
});
