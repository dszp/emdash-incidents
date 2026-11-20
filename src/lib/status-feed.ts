// The status pages' robots rule and the RSS feed's name and path
// (src/pages/status/feed.xml.ts).
import { INCIDENT_CONFIG } from "./incident-config";

/**
 * Service notices stay out of search results: they are time-bound, and an
 * old outage page should not rank for the company's name. "follow" lets
 * crawlers still reach the rest of the site through their links.
 */
export const STATUS_ROBOTS = "noindex, follow";

export const STATUS_FEED = { title: INCIDENT_CONFIG.feedTitle, href: "/status/feed.xml" } as const;

/**
 * The public site's origin for absolute links in the feed and active.json:
 * Astro's `site` setting when it is set, else the request's own origin. Set
 * `site` if the site answers on more than one host (an admin host, say) and
 * your cache keys by path alone: a response cached from one host is then
 * served on every host.
 */
export function siteOrigin(requestUrl: URL): string {
	const site = import.meta.env.SITE as string | undefined;
	return site ? new URL(site).origin : requestUrl.origin;
}
