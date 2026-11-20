// What the banner shows right now, as JSON (src/lib/active-notices.ts).
import type { APIRoute } from "astro";

import { activeNotices } from "../../lib/active-notices";
import { publicCache } from "../../lib/cache-policy";
import { loadIncidents } from "../../lib/incident-data";
import { INCIDENT_CONFIG } from "../../lib/incident-config";
import { siteOrigin } from "../../lib/status-feed";

export const GET: APIRoute = async (context) => {
	const { cache } = context;
	const { incidents, cacheHint } = await loadIncidents();
	if (cache?.enabled) {
		if (cacheHint) cache.set(cacheHint);
		// Not stored without the incidents' hint: nothing could purge it.
		cache.set(cacheHint ? publicCache(context) : false);
	}
	return new Response(JSON.stringify(activeNotices(incidents, siteOrigin(context.url), INCIDENT_CONFIG.phone)), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=60",
			"X-Robots-Tag": "noindex",
			// Other sites' scripts may fetch this from the browser. The data is
			// public and the request carries no credentials, so any origin may
			// read it.
			"Access-Control-Allow-Origin": "*",
		},
	});
};
