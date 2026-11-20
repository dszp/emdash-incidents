// /status/active.json: what the site's banner shows right now, for other
// sites and apps that show the same banner (a docs site's server, or a script
// in a customer portal, which is why the route sends CORS headers). The rule
// is the banner's own, currentIncident, so the two always agree: at most one
// notice, including the green "resolved" banner's RESOLVED_BANNER_HOURS tail.
//
// The shape is a contract with whoever reads it; once something depends on
// it, add fields rather than renaming or removing them.

import { contactLinks, currentIncident, incidentUrl, lastChanged, RESOLVED_BANNER_HOURS, type ContactLink, type Incident } from "./incidents";
import { inlineLinks } from "./inline-links";

export interface ActiveNotice {
	id: string;
	title: string;
	/** "ongoing" until the Resolved time is set, then "resolved". */
	state: "ongoing" | "resolved";
	/** The banner text, plain: a [label](url) link becomes its label. */
	summary: string;
	url: string;
	started: string | null;
	updated: string | null;
	/** When the banner stops showing it, or null while it is ongoing. */
	until: string | null;
	/**
	 * The contact links the banner shows, in order: the configured phone, and
	 * an alternate email when the incident has one (the usual one may be down).
	 */
	contacts: ContactLink[];
}

export interface ActiveNotices {
	updated: string;
	notices: ActiveNotice[];
}

const plain = (s: string) => inlineLinks(s).map((p) => p.text).join("");

type Phone = { label: string; href: string } | null;

export function activeNotices(incidents: Incident[], origin: string, phone: Phone, now: Date = new Date()): ActiveNotices {
	const i = currentIncident(incidents, now);
	return { updated: now.toISOString(), notices: i ? [notice(i, origin, phone)] : [] };
}

function notice(i: Incident, origin: string, phone: Phone): ActiveNotice {
	return {
		id: i.slug,
		title: plain(i.title),
		state: i.resolvedAt ? "resolved" : "ongoing",
		summary: plain(i.banner),
		url: origin + incidentUrl(i.slug),
		started: i.startedAt?.toISOString() ?? null,
		updated: lastChanged(i)?.toISOString() ?? null,
		until: i.resolvedAt ? new Date(i.resolvedAt.getTime() + RESOLVED_BANNER_HOURS * 3_600_000).toISOString() : null,
		contacts: contactLinks(i, phone),
	};
}
