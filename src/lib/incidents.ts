// Incidents: public notices about an outage, often someone else's (a
// Microsoft 365 outage that stops your email), shown as a yellow banner on
// every page and as a page of updates at /status/<slug>/.
//
// An incident shows when it is published and "Show banner" is checked. The
// newest such incident is the one the banner and /status/ point to. Unchecking
// the box (or unpublishing) takes the banner down and keeps the updates; a new
// incident is a new entry, so an old one's updates never reappear.
//
// Setting Resolved turns the banner green, and it goes away by itself
// RESOLVED_BANNER_HOURS later: each render compares the time, so nothing has
// to switch it off. A cached page can show it until the cache expires.

import { INCIDENT_CONFIG } from "./incident-config";

export const INCIDENTS = "incidents";

/** How long the green "resolved" banner stays up after the Resolved time. */
export const RESOLVED_BANNER_HOURS = INCIDENT_CONFIG.resolvedBannerHours;

/** The zone update times are shown in. */
export const TIME_ZONE = INCIDENT_CONFIG.timeZone;

export type ContactMethod = "phone" | "email";

export interface IncidentUpdate {
	postedAt: Date;
	message: string;
}

/** The fields of an incident entry the theme needs, already checked. */
export interface Incident {
	slug: string;
	title: string;
	banner: string;
	active: boolean;
	linkUpdates: boolean;
	contact: ContactMethod[];
	contactEmail: string | null;
	pinned: string | null;
	/** Newest first. Rows without a valid time or message are dropped. */
	updates: IncidentUpdate[];
	/** When the incident began: the Started field, else when it was published. */
	startedAt: Date | null;
	/** When it was resolved, or null while it is ongoing. */
	resolvedAt: Date | null;
	publishedAt: Date | null;
	updatedAt: Date | null;
}

/** The URL an incident's page answers at. */
export const incidentUrl = (slug: string) => `/status/${slug}/`;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function date(v: unknown): Date | null {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
	if (typeof v === "string" && v.trim()) {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}

// Loose enough for an editor's typo to fall back to no email rather than a
// broken mailto: link; not a full address validator.
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** An incident entry from getEmDashCollection/getEmDashEntry, normalised. */
export function toIncident(entry: { id: string; data: Record<string, unknown> }): Incident {
	const d = entry.data;
	const contact = (Array.isArray(d.contact) ? d.contact : []).filter((c): c is ContactMethod => c === "phone" || c === "email");
	const email = text(d.contact_email);
	const updates = (Array.isArray(d.updates) ? d.updates : [])
		.map((row) => {
			const r = (row ?? {}) as Record<string, unknown>;
			const postedAt = date(r.posted_at);
			const message = text(r.message);
			return postedAt && message ? { postedAt, message } : null;
		})
		.filter((u): u is IncidentUpdate => u !== null)
		.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
	return {
		slug: entry.id,
		title: text(d.title) ?? entry.id,
		banner: text(d.banner) ?? text(d.title) ?? entry.id,
		active: d.active === true || d.active === 1,
		linkUpdates: d.link_updates !== false && d.link_updates !== 0,
		contact: [...new Set(contact)],
		contactEmail: email && EMAIL.test(email) ? email : null,
		pinned: text(d.pinned),
		updates,
		startedAt: date(d.started_at) ?? date(d.publishedAt),
		resolvedAt: date(d.resolved_at),
		publishedAt: date(d.publishedAt),
		updatedAt: date(d.updatedAt),
	};
}

export interface ContactLink {
	method: ContactMethod;
	label: string;
	href: string;
}

/**
 * The contact links an incident shows, in the order phone, email. Email is the
 * incident's alternate address, never the site's usual one: the usual one is
 * typically what is down. Email is left out until an address is entered.
 */
export function contactLinks(
	incident: Pick<Incident, "contact" | "contactEmail">,
	phone: { label: string; href: string } | null = INCIDENT_CONFIG.phone,
): ContactLink[] {
	const links: ContactLink[] = [];
	if (incident.contact.includes("phone") && phone) links.push({ method: "phone", ...phone });
	if (incident.contact.includes("email") && incident.contactEmail) {
		links.push({ method: "email", label: incident.contactEmail, href: `mailto:${incident.contactEmail}` });
	}
	return links;
}

/**
 * Whether an incident's banner is up at `now`: "Show banner" is checked and it
 * is either unresolved or resolved less than RESOLVED_BANNER_HOURS ago.
 */
export function showsBanner(i: Pick<Incident, "active" | "resolvedAt">, now: Date = new Date()): boolean {
	if (!i.active) return false;
	if (!i.resolvedAt) return true;
	return now.getTime() < i.resolvedAt.getTime() + RESOLVED_BANNER_HOURS * 3_600_000;
}

/** The incident the banner shows and /status/ sends visitors to: the newest one whose banner is up. */
export function currentIncident(incidents: Incident[], now: Date = new Date()): Incident | null {
	const active = incidents.filter((i) => showsBanner(i, now));
	active.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
	return active[0] ?? null;
}

/** When an incident last changed, for display: its newest update, else when it started. */
export const lastChanged = (i: Incident): Date | null => i.updates[0]?.postedAt ?? i.startedAt;

const FORMAT = new Intl.DateTimeFormat(INCIDENT_CONFIG.locale, {
	timeZone: TIME_ZONE,
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZoneName: "short",
});

/** "Nov 13, 2026, 6:42 AM EST" */
export const formatTime = (d: Date) => FORMAT.format(d);

export interface FeedItem {
	title: string;
	link: string;
	guid: string;
	date: Date;
	description: string;
}

/**
 * The status feed: one item when an incident starts (its banner text), one
 * per update and one when it is resolved, newest first, across every
 * published incident.
 */
export function feedItems(incidents: Incident[], origin: string, limit = 50): FeedItem[] {
	const items: FeedItem[] = [];
	for (const i of incidents) {
		const link = origin + incidentUrl(i.slug);
		if (i.startedAt) {
			items.push({ title: i.title, link, guid: `${link}#start`, date: i.startedAt, description: i.banner });
		}
		// The time is in the guid so a resolve after a re-open is a new item.
		if (i.resolvedAt) {
			items.push({ title: `${i.title}: resolved`, link, guid: `${link}#resolved-${i.resolvedAt.toISOString()}`, date: i.resolvedAt, description: i.banner });
		}
		for (const u of i.updates) {
			items.push({ title: `${i.title}: update`, link, guid: `${link}#${u.postedAt.toISOString()}`, date: u.postedAt, description: u.message });
		}
	}
	return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
