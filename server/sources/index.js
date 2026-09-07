import * as revenuecat from './revenuecat.js';
import * as admob from './admob.js';
import * as adsense from './adsense.js';
import * as play from './playEarnings.js';
import * as appstore from './appstore.js';
import * as wise from './wise.js';
import * as paypal from './paypal.js';

export const SOURCES = [revenuecat, admob, adsense, play, appstore, wise, paypal];

// Alle Konfigurationsfelder aller Quellen, nach Schlüssel.
export const FIELDS = new Map(SOURCES.flatMap((s) => (s.meta.fields || []).map((f) => [f.key, { ...f, source: s.meta.id }])));
