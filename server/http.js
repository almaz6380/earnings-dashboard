// Kleine fetch-Hilfen mit sprechenden Fehlern.
export async function getJSON(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${url.split('?')[0]} -> ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Keine JSON-Antwort von ${url.split('?')[0]}: ${text.slice(0, 120)}`); }
}

export async function getBuffer(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = new Error(`${init.method || 'GET'} ${url.split('?')[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

export const ymd = (d) => d.toISOString().slice(0, 10);
export const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 86400000);
export const monthKey = (d) => d.toISOString().slice(0, 7);
