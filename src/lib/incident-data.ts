// Loading incidents (src/lib/incidents.ts) from EmDash, with the cache hint
// that lets a publish or edit purge every page that showed the banner.
import { getEmDashCollection, getEmDashEntry } from "emdash";

import { INCIDENTS, toIncident, type Incident } from "./incidents";

type Hint = Awaited<ReturnType<typeof getEmDashCollection>>["cacheHint"];

/**
 * Every published incident, newest first, or none if the collection does not
 * exist yet. The theme can reach a site before `scripts/incidents.ts schema`
 * has created the collection there, and the banner must not take every page
 * down with it.
 */
export async function loadIncidents(): Promise<{ incidents: Incident[]; cacheHint: Hint | null }> {
	try {
		const incidents: Incident[] = [];
		let cursor: string | undefined;
		let cacheHint: Hint | null = null;
		do {
			const page = await getEmDashCollection(INCIDENTS, { orderBy: { published_at: "desc" }, limit: 100, cursor });
			// A missing collection comes back as an error with an empty cache
			// hint, not as a throw; a page cached with that hint would never
			// be purged when the first incident is published.
			if (page.error) throw page.error;
			cacheHint ??= page.cacheHint;
			incidents.push(...page.entries.map((e) => toIncident(e as never)));
			cursor = page.nextCursor;
		} while (cursor);
		return { incidents, cacheHint };
	} catch (error) {
		console.warn("incidents unavailable", error);
		return { incidents: [], cacheHint: null };
	}
}

/** One incident by slug (a preview token shows its draft), or null. */
export async function loadIncident(slug: string): Promise<{ incident: Incident; cacheHint: Hint } | null> {
	try {
		const { entry, cacheHint } = await getEmDashEntry(INCIDENTS, slug);
		return entry ? { incident: toIncident(entry as never), cacheHint } : null;
	} catch (error) {
		console.warn("incident unavailable", error);
		return null;
	}
}
