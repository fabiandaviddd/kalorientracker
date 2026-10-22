// Briefkasten für das Protokoll des Kalorientrackers (Cloudflare Worker).
// Die App wirft neue Protokolleinträge ein (POST /protokoll); lesen kann nur Fabians Cloudflare-Konto (wrangler am Mac).
// Ein Schlüssel pro Gerät und Tag (UTC), Einträge werden zusammengeführt und verfallen nach 120 Tagen.
const ALLOWED_ORIGINS = ['https://fabiandaviddd.github.io', 'http://localhost:8321'];
const MAX_BODY = 512_000; // Zeichen
const MAX_ENTRIES = 5000;
const TTL = 120 * 24 * 60 * 60;

const entryKey = (x) => `${x.t}|${x.e}|${JSON.stringify(x)}`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' } });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/protokoll') {
      return new Response('Nur Einwurf', { status: 405, headers: cors });
    }
    const text = await request.text();
    if (text.length > MAX_BODY) return new Response('Zu groß', { status: 413, headers: cors });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response('Kein JSON', { status: 400, headers: cors });
    }
    const { geraet, eintraege } = data ?? {};
    if (typeof geraet !== 'string' || !/^[0-9a-f-]{36}$/.test(geraet) || !Array.isArray(eintraege) || eintraege.length > MAX_ENTRIES) {
      return new Response('Ungültig', { status: 400, headers: cors });
    }
    const byDay = new Map();
    for (const x of eintraege) {
      if (!x || typeof x !== 'object' || typeof x.t !== 'string' || typeof x.e !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(x.t)) continue;
      const day = x.t.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(x);
    }
    for (const [day, list] of byDay) {
      const key = `p/${geraet}/${day}`;
      const old = (await env.BRIEFKASTEN.get(key, 'json')) ?? [];
      const seen = new Set(old.map(entryKey));
      const merged = [...old, ...list.filter((x) => !seen.has(entryKey(x)))].sort((a, b) => a.t.localeCompare(b.t));
      await env.BRIEFKASTEN.put(key, JSON.stringify(merged), { expirationTtl: TTL });
    }
    return new Response(null, { status: 204, headers: cors });
  },
};
