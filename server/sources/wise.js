// Wise: Kontostände je Währung (persönlicher API-Token, nur lesen).
import { getJSON } from '../http.js';

export const meta = { id: 'wise', label: 'Wise', art: 'Kontostand', kind: 'balance',
  needs: ['WISE_API_TOKEN', 'WISE_PROFILE_ID'], mehrfach: true, entdeckbar: true,
  entdeckenAb: ['WISE_API_TOKEN'],
  konsole: { url: 'https://wise.com/settings/public-keys', text: 'Wise-Einstellungen öffnen' },
  help: 'Wise → Einstellungen → API-Token, Typ „Read only". Das Profil suchen wir mit dem Token selbst.',
  felder: [
    { key: 'WISE_API_TOKEN', label: 'API-Token (nur lesen)', secret: true },
    { key: 'WISE_PROFILE_ID', label: 'Profil-ID' },
  ] };

export const vollstaendig = (e) => !!(e?.WISE_API_TOKEN && e?.WISE_PROFILE_ID);

// Mit dem Token lassen sich die Profile auflisten - die ID muss niemand abtippen.
export async function entdecke({ eintrag = {}, fetchJSON = getJSON } = {}) {
  if (!eintrag.WISE_API_TOKEN) throw new Error('Erst den API-Token eintragen.');
  const liste = await fetchJSON('https://api.wise.com/v2/profiles', {
    headers: { authorization: `Bearer ${eintrag.WISE_API_TOKEN}` },
  });
  return (Array.isArray(liste) ? liste : []).map((p) => ({
    werte: { WISE_PROFILE_ID: String(p.id) },
    label: p.fullName || p.details?.name || [p.details?.firstName, p.details?.lastName].filter(Boolean).join(' ') || `Profil ${p.id}`,
    hinweis: p.type === 'BUSINESS' ? 'Geschäftskonto' : 'Privatkonto',
  }));
}

export async function fetchData({ eintrag = {} } = {}) {
  const list = await getJSON(`https://api.wise.com/v4/profiles/${encodeURIComponent(eintrag.WISE_PROFILE_ID)}/balances?types=STANDARD`, {
    headers: { authorization: `Bearer ${eintrag.WISE_API_TOKEN}` },
  });
  const balances = (Array.isArray(list) ? list : []).map((b) => ({ amount: Number(b.amount?.value ?? 0), currency: b.amount?.currency || b.currency }));
  return { currency: balances[0]?.currency || null, asOf: new Date().toISOString(), daily: [], balance: null, balances, extra: {}, note: null };
}
