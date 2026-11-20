// RSS for service notices at /status/feed.xml: an item when an incident is
// published and one per update, across every incident (src/lib/incidents.ts).
import type { APIRoute } from "astro";
import { getSiteSettingsWithCacheHint } from "emdash";

import { publicCache } from "../../lib/cache-policy";
import { loadIncidents } from "../../lib/incident-data";
import { feedItems } from "../../lib/incidents";
import { INCIDENT_CONFIG } from "../../lib/incident-config";
import { inlineLinks } from "../../lib/inline-links";
import { siteOrigin, STATUS_FEED } from "../../lib/status-feed";

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Plain text for a feed reader: [label](url) becomes "label (url)". */
const plain = (s: string) => inlineLinks(s).map((p) => ("href" in p ? `${p.text} (${p.href})` : p.text)).join("");

export const GET: APIRoute = async (context) => {
	const { cache } = context;
	const origin = siteOrigin(context.url);
	const [{ incidents, cacheHint }, { data: settings, cacheHint: settingsHint }] = await Promise.all([loadIncidents(), getSiteSettingsWithCacheHint()]);
	if (cache?.enabled) {
		if (cacheHint) cache.set(cacheHint);
		cache.set(settingsHint);
		// Not stored without the incidents' hint: nothing could purge it.
		cache.set(cacheHint ? publicCache(context) : false);
	}
	const items = feedItems(incidents, origin)
		.map(
			(i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${i.link}</link>
      <guid isPermaLink="true">${escapeXml(i.guid)}</guid>
      <pubDate>${i.date.toUTCString()}</pubDate>
      <description>${escapeXml(plain(i.description))}</description>
    </item>`,
		)
		.join("\n");
	const site = settings.title ?? "";
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${site} ${STATUS_FEED.title}`.trim())}</title>
    <link>${origin}/status/</link>
    <atom:link href="${origin}${STATUS_FEED.href}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(`Outage notices and updates from ${site}`.trim())}</description>
    <language>${INCIDENT_CONFIG.locale.toLowerCase()}</language>
${items}
  </channel>
</rss>
`,
		// Short: a feed reader polling during an outage should see updates soon.
		{ headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=120", "X-Robots-Tag": "noindex" } },
	);
};
