// How long a cache in front of the site may keep a public response. Only used
// when Astro's route cache is enabled (Astro.cache.enabled), as it is on
// Cloudflare with Workers Cache. If your site already has a cache policy, use
// it instead and delete this file.
//
// EmDash purges a response's tags when the content behind it changes (admin
// edits, scheduled publishing, plugin writes). On Cloudflare, Workers Cache
// purges are rate-limited (5 a minute, bursts of 25, per account) and a
// rate-limited purge fails silently, so maxAge is the longest a change can
// stay hidden after a burst of edits.
//
// Without a maxAge, @astrojs/cloudflare adds `Cloudflare-CDN-Cache-Control:
// no-store` to the response, and Workers Cache follows that header over
// Cache-Control, so a route that sends only `Cache-Control: public, ...` is
// still not stored.
export const PUBLIC_CACHE = { maxAge: 300, swr: 3600 } as const;

interface RequestFacts {
	url: URL;
	cookies: { get(name: string): { value: string } | undefined };
	locals: { user?: unknown };
}

/**
 * The cache setting for a public response: PUBLIC_CACHE for an anonymous,
 * ordinary request, otherwise false. Edit mode and preview links can render
 * drafts, and a cache that keys by path alone would serve an editor's copy to
 * everyone.
 */
export function publicCache({ url, cookies, locals }: RequestFacts): typeof PUBLIC_CACHE | false {
	const editing = cookies.get("emdash-edit-mode")?.value === "true";
	const preview = url.searchParams.has("_preview") || url.searchParams.has("_edit");
	return editing || preview || locals.user ? false : PUBLIC_CACHE;
}
