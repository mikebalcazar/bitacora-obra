// Bitácora de Obra — Cloudflare Worker (API + assets)
// Bindings: DB (D1), FILES (R2), ASSETS (static). Vars: MAIL_FROM, APP_NAME, DEV. Secrets: RESEND_API_KEY

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_H, ...extra } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const plusMin = (m) => new Date(Date.now() + m * 60000).toISOString();
const uid = () => crypto.randomUUID();
const COOKIE = 'bo_session';

// ---------- auth helpers ----------
function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function getUser(req, env) {
  const token = getCookie(req, COOKIE) || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`
  ).bind(token, now()).first();
  return row || null;
}
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'int');

async function canAccessProject(env, user, projectId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`).bind(projectId, user.id).first();
  return !!r;
}
async function projectOfPlan(env, planId) {
  const r = await env.DB.prepare(`SELECT project_id FROM plans WHERE id = ?`).bind(planId).first();
  return r ? r.project_id : null;
}
async function projectOfElement(env, elementId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM elements e JOIN plans p ON p.id = e.plan_id WHERE e.id = ?`).bind(elementId).first();
  return r ? r.project_id : null;
}
async function projectOfPunch(env, punchId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans p ON p.id = e.plan_id WHERE k.id = ?`).bind(punchId).first();
  return r ? r.project_id : null;
}

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return { dev: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Bitácora de Obra <onboarding@resend.dev>', to: [to], subject, html }),
  });
  if (!r.ok) throw new Error('mail: ' + (await r.text()));
  return { ok: true };
}

// ---------- photos ----------
async function savePhotos(env, user, ownerType, ownerId, files) {
  const out = [];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    const id = uid();
    const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `photos/${ownerType}/${ownerId}/${id}.${ext}`;
    await env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type || 'image/jpeg' } });
    await env.DB.prepare(
      `INSERT INTO photos (id, owner_type, owner_id, r2_key, file_name, size, user_id) VALUES (?,?,?,?,?,?,?)`
    ).bind(id, ownerType, ownerId, key, f.name || '', f.size, user.id).run();
    out.push({ id, r2_key: key, file_name: f.name || '', size: f.size, user_id: user.id, created_at: now() });
  }
  return out;
}
async function photosFor(env, ownerType, ids) {
  if (!ids.length) return {};
  const q = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS user_name FROM photos p LEFT JOIN users u ON u.id = p.user_id WHERE p.owner_type = ? AND p.owner_id IN (${q}) ORDER BY p.created_at`
  ).bind(ownerType, ...ids).all();
  const map = {};
  for (const p of results) (map[p.owner_id] ||= []).push(p);
  return map;
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) return await api(req, env, url, path);
      if (path.startsWith('/files/')) return await serveFile(req, env, path.slice(7));
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return err(e.message || 'error interno', 500);
    }
  },
};

async function serveFile(req, env, key) {
  const user = await getUser(req, env);
  if (!user) return err('no autorizado', 401);
  const obj = await env.FILES.get(key);
  if (!obj) return err('no encontrado', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'private, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
}

async function api(req, env, url, path) {
  const m = req.method;
  const seg = path.slice(5).split('/').filter(Boolean); // after /api/

  // Señal de vida, sin sesión: la usa el despliegue para comprobar que el
  // Worker quedó arriba antes de dar por buena la publicación.
  if (seg[0] === 'salud' && m === 'GET') return json({ ok: true, app: env.APP_NAME || 'Bitácora de Obra', hora: now() });

  // ----- auth -----
  if (seg[0] === 'auth') {
    if (seg[1] === 'request' && m === 'POST') {
      const { email } = await req.json();
      const e = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('correo inválido');
      let user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(e).first();
      if (!user) {
        const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
        if (count.n === 0) {
          // primer usuario = admin
          await env.DB.prepare(`INSERT INTO users (id, email, name, role, company) VALUES (?,?,?,?,?)`).bind(uid(), e, e.split('@')[0], 'admin', '').run();
          user = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(e).first();
        } else return err('Este correo no tiene acceso. Pide al administrador que te dé de alta.', 403);
      }
      if (!user.active) return err('Usuario inactivo', 403);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.DB.prepare(`INSERT OR REPLACE INTO login_codes (email, code, expires_at, attempts) VALUES (?,?,?,0)`).bind(e, code, plusMin(10)).run();
      const mail = await sendMail(env, e, `${code} — tu código de acceso`, `<p>Tu código para entrar a <b>${env.APP_NAME || 'Bitácora de Obra'}</b>:</p><p style="font-size:28px;letter-spacing:6px"><b>${code}</b></p><p>Vence en 10 minutos.</p>`);
      return json({ ok: true, ...(mail.dev && env.DEV ? { dev_code: code } : {}) });
    }
    if (seg[1] === 'verify' && m === 'POST') {
      const { email, code } = await req.json();
      const e = String(email || '').trim().toLowerCase();
      const row = await env.DB.prepare(`SELECT * FROM login_codes WHERE email = ?`).bind(e).first();
      if (!row || row.expires_at < now()) return err('Código vencido. Pide uno nuevo.', 401);
      if (row.attempts >= 5) return err('Demasiados intentos. Pide otro código.', 429);
      if (row.code !== String(code || '').trim()) {
        await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?`).bind(e).run();
        return err('Código incorrecto', 401);
      }
      const user = await env.DB.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).bind(e).first();
      if (!user) return err('Usuario no encontrado', 404);
      const token = uid() + uid().replace(/-/g, '');
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)`).bind(token, user.id, plusMin(60 * 24 * 90)),
        env.DB.prepare(`DELETE FROM login_codes WHERE email = ?`).bind(e),
      ]);
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return json({ ok: true, user: pubUser(user), token }, 200, {
        'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`,
      });
    }
    if (seg[1] === 'logout' && m === 'POST') {
      const token = getCookie(req, COOKIE);
      if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
    }
    return err('ruta no encontrada', 404);
  }

  const user = await getUser(req, env);
  if (!user) return err('no autorizado', 401);

  if (seg[0] === 'me' && m === 'GET') return json({ user: pubUser(user) });

  // ----- users (admin) -----
  if (seg[0] === 'users') {
    if (user.role !== 'admin') return err('sólo administrador', 403);
    if (m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, email, name, role, company, active, created_at FROM users ORDER BY role, name`).all();
      return json({ users: results });
    }
    if (m === 'POST') {
      const b = await req.json();
      const e = String(b.email || '').trim().toLowerCase();
      if (!e) return err('correo requerido');
      const id = uid();
      await env.DB.prepare(`INSERT INTO users (id, email, name, role, company) VALUES (?,?,?,?,?)`)
        .bind(id, e, b.name || e.split('@')[0], ['admin', 'int', 'con'].includes(b.role) ? b.role : 'con', b.company || '').run();
      return json({ ok: true, id });
    }
    if (m === 'PATCH' && seg[1]) {
      const b = await req.json();
      await env.DB.prepare(`UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), company = COALESCE(?, company), active = COALESCE(?, active) WHERE id = ?`)
        .bind(b.name ?? null, b.role ?? null, b.company ?? null, b.active === undefined ? null : (b.active ? 1 : 0), seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- projects -----
  if (seg[0] === 'projects') {
    if (!seg[1]) {
      if (m === 'GET') {
        const sql = isStaff(user)
          ? `SELECT p.*, (SELECT COUNT(*) FROM punch_items k JOIN elements e ON e.id=k.element_id JOIN plans pl ON pl.id=e.plan_id WHERE pl.project_id=p.id AND k.status!='ok') AS open_count FROM projects p ORDER BY p.status, p.name`
          : `SELECT p.*, (SELECT COUNT(*) FROM punch_items k JOIN elements e ON e.id=k.element_id JOIN plans pl ON pl.id=e.plan_id WHERE pl.project_id=p.id AND k.status!='ok') AS open_count FROM projects p JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=? ORDER BY p.status, p.name`;
        const stmt = isStaff(user) ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(user.id);
        const { results } = await stmt.all();
        return json({ projects: results });
      }
      if (m === 'POST') {
        if (!isStaff(user)) return err('sin permiso', 403);
        const b = await req.json();
        if (!b.name) return err('nombre requerido');
        const id = uid();
        await env.DB.prepare(`INSERT INTO projects (id, name, client, created_by) VALUES (?,?,?,?)`).bind(id, b.name, b.client || '', user.id).run();
        return json({ ok: true, id });
      }
    }
    const pid = seg[1];
    if (!(await canAccessProject(env, user, pid))) return err('sin acceso al proyecto', 403);

    if (!seg[2] && m === 'GET') {
      const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(pid).first();
      if (!project) return err('no encontrado', 404);
      const { results: plans } = await env.DB.prepare(`SELECT * FROM plans WHERE project_id = ? ORDER BY sort, created_at`).bind(pid).all();
      const { results: elements } = await env.DB.prepare(
        `SELECT e.*,
           (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
           (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
           (SELECT COUNT(*) FROM punch_items k WHERE k.element_id=e.id) AS n_total,
           (SELECT COUNT(*) FROM log_entries l WHERE l.element_id=e.id) AS n_log
         FROM elements e JOIN plans p ON p.id = e.plan_id WHERE p.project_id = ? ORDER BY e.code`
      ).bind(pid).all();
      const { results: members } = await env.DB.prepare(`SELECT u.id, u.name, u.email, u.role, u.company FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?`).bind(pid).all();
      return json({ project, plans, elements, members });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE projects SET name = COALESCE(?, name), client = COALESCE(?, client), status = COALESCE(?, status) WHERE id = ?`).bind(b.name ?? null, b.client ?? null, b.status ?? null, pid).run();
      return json({ ok: true });
    }
    if (seg[2] === 'members' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)`).bind(pid, b.user_id).run();
      return json({ ok: true });
    }
    if (seg[2] === 'members' && m === 'DELETE' && seg[3]) {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`).bind(pid, seg[3]).run();
      return json({ ok: true });
    }
    if (seg[2] === 'plans' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const fd = await req.formData();
      const image = fd.get('image');
      if (!(image instanceof File)) return err('imagen del plano requerida');
      const id = uid();
      const imageKey = `plans/${pid}/${id}.png`;
      await env.FILES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type || 'image/png' } });
      let sourceKey = null;
      const source = fd.get('source');
      if (source instanceof File && source.size) {
        sourceKey = `plans/${pid}/${id}-src.${(source.name.split('.').pop() || 'pdf').toLowerCase()}`;
        await env.FILES.put(sourceKey, source.stream(), { httpMetadata: { contentType: source.type || 'application/pdf' } });
      }
      const sort = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM plans WHERE project_id = ?`).bind(pid).first();
      await env.DB.prepare(`INSERT INTO plans (id, project_id, name, file_name, image_key, source_key, width, height, sort) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, pid, fd.get('name') || 'Plano', fd.get('file_name') || '', imageKey, sourceKey, +fd.get('width') || 0, +fd.get('height') || 0, sort.s).run();
      return json({ ok: true, id, image_key: imageKey });
    }
    if (seg[2] === 'punch' && m === 'GET') {
      const open = url.searchParams.get('status') !== 'all';
      const { results } = await env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.plan_id, pl.name AS plan_name
         FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ${open ? "AND k.status != 'ok'" : ''}
         ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      ).bind(pid).all();
      return json({ items: results });
    }
    // reporte: todo lo del proyecto (bitácora + punchlist + fotos) para armar el PDF en el cliente
    if (seg[2] === 'report' && m === 'GET') {
      const { results: logs } = await env.DB.prepare(
        `SELECT l.*, u.name AS user_name, u.role AS user_role, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.resp AS element_resp, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM log_entries l JOIN users u ON u.id = l.user_id JOIN elements e ON e.id = l.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY l.created_at`
      ).bind(pid).all();
      const { results: punch } = await env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM punch_items k JOIN elements e ON e.id = k.element_id JOIN plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      ).bind(pid).all();
      const lp = await photosFor(env, 'log', logs.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      logs.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      return json({ logs, punch });
    }
  }

  // ----- plans -----
  if (seg[0] === 'plans' && seg[1]) {
    const pid = await projectOfPlan(env, seg[1]);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (seg[2] === 'elements' && m === 'POST') {
      const b = await req.json();
      if (!b.name) return err('nombre requerido');
      const id = uid();
      await env.DB.prepare(`INSERT INTO elements (id, plan_id, code, type, name, resp, x, y, created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, seg[1], b.code || '', b.type || 'Otro', b.name, b.resp || '', +b.x, +b.y, user.id).run();
      return json({ ok: true, id });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE plans SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?`).bind(b.name ?? null, b.sort ?? null, seg[1]).run();
      return json({ ok: true });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM plans WHERE id = ?`).bind(seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- elements -----
  if (seg[0] === 'elements' && seg[1]) {
    const eid = seg[1];
    const pid = await projectOfElement(env, eid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'GET') {
      const element = await env.DB.prepare(`SELECT e.*, pl.name AS plan_name FROM elements e JOIN plans pl ON pl.id = e.plan_id WHERE e.id = ?`).bind(eid).first();
      const { results: log } = await env.DB.prepare(`SELECT l.*, u.name AS user_name, u.role AS user_role FROM log_entries l JOIN users u ON u.id = l.user_id WHERE l.element_id = ? ORDER BY l.created_at`).bind(eid).all();
      const { results: punch } = await env.DB.prepare(`SELECT k.*, u.name AS created_by_name FROM punch_items k LEFT JOIN users u ON u.id = k.created_by WHERE k.element_id = ? ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`).bind(eid).all();
      const lp = await photosFor(env, 'log', log.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      log.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      return json({ element, log, punch });
    }
    if (!seg[2] && m === 'PATCH') {
      const b = await req.json();
      await env.DB.prepare(`UPDATE elements SET code = COALESCE(?, code), type = COALESCE(?, type), name = COALESCE(?, name), resp = COALESCE(?, resp), x = COALESCE(?, x), y = COALESCE(?, y) WHERE id = ?`)
        .bind(b.code ?? null, b.type ?? null, b.name ?? null, b.resp ?? null, b.x ?? null, b.y ?? null, eid).run();
      return json({ ok: true });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM elements WHERE id = ?`).bind(eid).run();
      return json({ ok: true });
    }
    if (seg[2] === 'log' && m === 'POST') {
      const fd = await req.formData();
      const text = String(fd.get('text') || '').trim();
      const files = fd.getAll('photos');
      if (!text && !files.length) return err('texto o foto requerido');
      const id = uid();
      const kind = ['trabajo', 'arreglo', 'acuerdo'].includes(fd.get('kind')) ? fd.get('kind') : 'trabajo';
      await env.DB.prepare(`INSERT INTO log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`).bind(id, eid, user.id, kind, text).run();
      const photos = await savePhotos(env, user, 'log', id, files);
      return json({ ok: true, id, photos });
    }
    if (seg[2] === 'punch' && m === 'POST') {
      const fd = await req.formData();
      const title = String(fd.get('title') || '').trim();
      if (!title) return err('título requerido');
      const id = uid();
      await env.DB.prepare(`INSERT INTO punch_items (id, element_id, title, description, resp, due_date, created_by) VALUES (?,?,?,?,?,?,?)`)
        .bind(id, eid, title, fd.get('description') || '', fd.get('resp') || '', fd.get('due_date') || null, user.id).run();
      const photos = await savePhotos(env, user, 'punch', id, fd.getAll('photos'));
      return json({ ok: true, id, photos });
    }
  }

  // ----- punch items -----
  if (seg[0] === 'punch' && seg[1]) {
    const kid = seg[1];
    const pid = await projectOfPunch(env, kid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'PATCH') {
      const b = await req.json();
      const st = ['pend', 'proc', 'ok'].includes(b.status) ? b.status : null;
      await env.DB.prepare(
        `UPDATE punch_items SET title = COALESCE(?, title), description = COALESCE(?, description), resp = COALESCE(?, resp), due_date = COALESCE(?, due_date),
          status = COALESCE(?, status), done_at = CASE WHEN ? = 'ok' THEN ? WHEN ? IS NOT NULL THEN NULL ELSE done_at END, done_by = CASE WHEN ? = 'ok' THEN ? ELSE done_by END WHERE id = ?`
      ).bind(b.title ?? null, b.description ?? null, b.resp ?? null, b.due_date ?? null, st, st, now(), st, st, user.id, kid).run();
      return json({ ok: true });
    }
    if (seg[2] === 'photos' && m === 'POST') {
      const fd = await req.formData();
      const photos = await savePhotos(env, user, 'punch', kid, fd.getAll('photos'));
      return json({ ok: true, photos });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM punch_items WHERE id = ?`).bind(kid).run();
      return json({ ok: true });
    }
  }

  // ----- photos -----
  if (seg[0] === 'photos' && seg[1] && m === 'DELETE') {
    const p = await env.DB.prepare(`SELECT * FROM photos WHERE id = ?`).bind(seg[1]).first();
    if (!p) return err('no encontrada', 404);
    if (!isStaff(user) && p.user_id !== user.id) return err('sin permiso', 403);
    await env.FILES.delete(p.r2_key);
    await env.DB.prepare(`DELETE FROM photos WHERE id = ?`).bind(seg[1]).run();
    return json({ ok: true });
  }

  return err('ruta no encontrada', 404);
}

function pubUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, company: u.company };
}
