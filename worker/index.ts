/// <reference types="@cloudflare/workers-types" />

type Env = {
  ASSETS: Fetcher
  DB?: D1Database
}

const STATE_KEY = 'team'

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
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/state') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database is not configured.' }, 503)
      }

      await ensureSchema(env.DB)

      if (request.method === 'GET') {
        const row = await env.DB
          .prepare('SELECT value, updated_at FROM app_state WHERE key = ?')
          .bind(STATE_KEY)
          .first<{ value: string; updated_at: string }>()

        return jsonResponse({
          state: row ? JSON.parse(row.value) : null,
          updatedAt: row?.updated_at ?? null,
        })
      }

      if (request.method === 'PUT') {
        const state = await request.json()
        const updatedAt = new Date().toISOString()

        await env.DB
          .prepare(
            `INSERT INTO app_state (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .bind(STATE_KEY, JSON.stringify(state), updatedAt)
          .run()

        return jsonResponse({ ok: true, updatedAt })
      }

      return jsonResponse({ error: 'Method not allowed.' }, 405)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
