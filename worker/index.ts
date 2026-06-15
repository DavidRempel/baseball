/// <reference types="@cloudflare/workers-types" />

type Env = {
  ASSETS: Fetcher
  ADMIN_TOKEN?: string
  DB?: D1Database
}

const LEGACY_STATE_KEY = 'team'
const DEFAULT_TEAM_ID = 'default'

type TeamRow = {
  id: string
  name: string
  edit_token: string | null
  created_at: string
  updated_at: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function ensureSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        edit_token TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS team_state (
        team_id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(team_id) REFERENCES teams(id)
      )`,
    )
    .run()

  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO teams (id, name, edit_token, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(DEFAULT_TEAM_ID, 'My Team', now, now)
    .run()

  const legacy = await db
    .prepare('SELECT value, updated_at FROM app_state WHERE key = ?')
    .bind(LEGACY_STATE_KEY)
    .first<{ value: string; updated_at: string }>()

  if (legacy) {
    await db
      .prepare(
        `INSERT INTO team_state (team_id, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(team_id) DO NOTHING`,
      )
      .bind(DEFAULT_TEAM_ID, legacy.value, legacy.updated_at)
      .run()
  }
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}

function makeToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
}

function getTeamId(url: URL) {
  return url.searchParams.get('team')?.trim() || DEFAULT_TEAM_ID
}

function getEditToken(request: Request, url: URL) {
  return request.headers.get('x-edit-token') || url.searchParams.get('edit') || ''
}

function getAdminToken(request: Request, url: URL) {
  return request.headers.get('x-admin-token') || url.searchParams.get('admin') || ''
}

function isAdmin(env: Env, token: string) {
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN)
}

async function canEdit(db: D1Database, teamId: string, token: string) {
  if (teamId === DEFAULT_TEAM_ID) return true
  const team = await db
    .prepare('SELECT edit_token FROM teams WHERE id = ?')
    .bind(teamId)
    .first<{ edit_token: string | null }>()
  return Boolean(team?.edit_token && token && team.edit_token === token)
}

function publicTeam(row: TeamRow) {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  }
}

function isAppRoute(request: Request, url: URL) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (url.pathname.startsWith('/api/')) return false
  return !url.pathname.split('/').pop()?.includes('.')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/teams' && request.method === 'GET') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database is not configured.' }, 503)
      }

      await ensureSchema(env.DB)
      const requestedIds = url.searchParams.get('ids')
      const ids = requestedIds
        ?.split(',')
        .map((id) => id.trim())
        .filter(Boolean)

      const rows = ids?.length
        ? await env.DB
          .prepare(`SELECT id, name, edit_token, created_at, updated_at FROM teams WHERE id IN (${ids.map(() => '?').join(',')})`)
          .bind(...ids)
          .all<TeamRow>()
        : await env.DB
          .prepare('SELECT id, name, edit_token, created_at, updated_at FROM teams WHERE id != ? ORDER BY name')
          .bind(DEFAULT_TEAM_ID)
          .all<TeamRow>()

      return jsonResponse({ teams: rows.results.map(publicTeam) })
    }

    if (url.pathname === '/api/teams' && request.method === 'POST') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database is not configured.' }, 503)
      }
      if (!isAdmin(env, getAdminToken(request, url))) {
        return jsonResponse({ error: 'Admin token required.' }, 403)
      }

      await ensureSchema(env.DB)
      const body = await request.json<{ name?: string; state?: unknown }>()
      const name = body.name?.trim() || 'New team'
      const id = makeId('team')
      const editToken = makeToken()
      const updatedAt = new Date().toISOString()

      await env.DB
        .prepare('INSERT INTO teams (id, name, edit_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, name, editToken, updatedAt, updatedAt)
        .run()

      await env.DB
        .prepare('INSERT INTO team_state (team_id, value, updated_at) VALUES (?, ?, ?)')
        .bind(id, JSON.stringify(body.state ?? null), updatedAt)
        .run()

      return jsonResponse({
        team: { id, name, updatedAt },
        editToken,
      }, 201)
    }

    const teamMatch = url.pathname.match(/^\/api\/teams\/([^/]+)$/)
    if (teamMatch && request.method === 'PATCH') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database is not configured.' }, 503)
      }

      await ensureSchema(env.DB)
      const teamId = decodeURIComponent(teamMatch[1])
      if (!(await canEdit(env.DB, teamId, getEditToken(request, url)))) {
        return jsonResponse({ error: 'Edit link required.' }, 403)
      }

      const body = await request.json<{ name?: string }>()
      const name = body.name?.trim()
      if (!name) return jsonResponse({ error: 'Team name is required.' }, 400)

      const updatedAt = new Date().toISOString()
      await env.DB
        .prepare('UPDATE teams SET name = ?, updated_at = ? WHERE id = ?')
        .bind(name, updatedAt, teamId)
        .run()

      return jsonResponse({ team: { id: teamId, name, updatedAt } })
    }

    if (url.pathname === '/api/state') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database is not configured.' }, 503)
      }

      await ensureSchema(env.DB)
      const teamId = getTeamId(url)

      if (request.method === 'GET') {
        const row = await env.DB
          .prepare('SELECT value, updated_at FROM team_state WHERE team_id = ?')
          .bind(teamId)
          .first<{ value: string; updated_at: string }>()

        return jsonResponse({
          state: row ? JSON.parse(row.value) : null,
          updatedAt: row?.updated_at ?? null,
        })
      }

      if (request.method === 'PUT') {
        if (!(await canEdit(env.DB, teamId, getEditToken(request, url)))) {
          return jsonResponse({ error: 'Edit link required.' }, 403)
        }

        const state = await request.json()
        const updatedAt = new Date().toISOString()

        await env.DB
          .prepare(
            `INSERT INTO team_state (team_id, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(team_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(teamId, JSON.stringify(state), updatedAt)
          .run()

        await env.DB
          .prepare('UPDATE teams SET updated_at = ? WHERE id = ?')
          .bind(updatedAt, teamId)
          .run()

        return jsonResponse({ ok: true, updatedAt })
      }

      return jsonResponse({ error: 'Method not allowed.' }, 405)
    }

    if (isAppRoute(request, url)) {
      const indexUrl = new URL('/', url)
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request))
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
