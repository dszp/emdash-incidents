# Installing the incident kit in an EmDash site

These instructions are written for a coding agent that is adding the kit to an existing EmDash site. A person can follow them too.

When you finish, the site has the following:

- An **Incidents** collection in the admin.
- A banner on every page while an incident is shown.
- An updates page for each incident at `/status/<slug>/`.
- `/status/`, which redirects to the current incident, or lists past ones when nothing is active.
- An RSS feed at `/status/feed.xml`.
- `/status/active.json`, for other sites that show the same banner.
- A command-line script for posting incidents from a terminal.

## Before you start

Check these facts about the site, because several steps depend on them:

1. The EmDash version, from `package.json`. The kit runs in production on EmDash 1.5 on Cloudflare Workers. It was also installed from these instructions on EmDash 0.39 with the Node adapter and SQLite, where steps 1 to 5, 7 and checks 1 to 5 of step 8 passed. It uses `getEmDashCollection`, `getEmDashEntry`, `decodeSlug`, `definePlugin`, `getSiteSettingsWithCacheHint` and `emdash/client`.
2. Whether Astro's route cache is enabled, meaning `Astro.cache.enabled` is true in production. Cloudflare sites with Workers Cache have it. If the cache is off, skip the part of step 6 marked for cached sites.
3. The base layout: its path, the props it takes, and whether it can add tags to `<head>`.
4. Whether `src/middleware.ts` exists.
5. Whether the site already has a `/status/` route, a `cache-policy` module, or an icon component.

Ask the site owner for these values before step 2:

- The time zone for update times.
- The phone number to show, if any.
- The URL of a live status page, if any.

## 1. Copy the files

Copy each file to the same path in the site's root, which is the directory that holds `astro.config.mjs`:

| Kit file | Purpose |
| --- | --- |
| `src/lib/incident-config.ts` | Every site-specific value. Edit this in step 2. |
| `src/lib/incidents.ts` | The model: parsing entries, when the banner shows, and feed items. |
| `src/lib/incident-data.ts` | Loads incidents from EmDash, with the cache hint. |
| `src/lib/active-notices.ts` | The shape of `/status/active.json`. |
| `src/lib/status-feed.ts` | The robots rule, the feed's name and path, and `siteOrigin()`. |
| `src/lib/inline-links.ts`, `src/lib/safe-href.ts` | `[label](url)` links in incident text. |
| `src/lib/cache-policy.ts` | `publicCache()`. Skip this file if the site has its own cache policy, and change the imports to use the site's. |
| `src/components/IncidentBanner.astro` | The banner. |
| `src/components/IncidentView.astro` | An incident's updates page. |
| `src/components/IncidentIcon.astro` | Inline SVG icons. You can swap these for the site's icon component. |
| `src/components/InlineText.astro` | Renders text that contains `[label](url)` links. |
| `src/pages/status/index.astro` | `/status/` |
| `src/pages/status/[slug].astro` | `/status/<slug>/` |
| `src/pages/status/feed.xml.ts` | `/status/feed.xml` |
| `src/pages/status/active.json.ts` | `/status/active.json` |
| `src/styles/incidents.css` | Styles for the banner and pages. |
| `plugins/incident-times/` (all four files) | Fills in a blank "Posted" time when an update is saved. |
| `scripts/incidents.ts`, `scripts/access-headers.ts`, `scripts/incidents.schema.json` | The command-line script and the collection's definition. |
| `src/lib/*.test.ts`, `plugins/incident-times/stamp.test.ts` | Tests. Copy them if the site uses Vitest. |

If a path is already taken, rename the kit's file and update its imports. Do not overwrite the site's file.

## 2. Set the site's values

Edit `src/lib/incident-config.ts`. Set `timeZone`, `phone` (or `null`), `statusPageUrl` (or `null`) and, if needed, `locale` and `feedTitle`.

If the site answers on more than one host, also set `site` in `astro.config.mjs` to the public URL. An admin hostname is the usual second host. Absolute links in the feed and in `active.json` use `site` when it is set, and otherwise the request's host.

## 3. Register the plugin

Add the plugin to the `emdash()` integration in `astro.config.mjs`:

```js
import { incidentTimes } from "./plugins/incident-times/index.ts";

emdash({
	// ...the site's existing options
	plugins: [/* existing plugins, */ incidentTimes()],
});
```

The plugin asks for the `content:write` capability. Without that capability, EmDash skips its hook and reports no error.

## 4. Adapt the pages to the layout

The pages in `src/pages/status/` and `IncidentView.astro` import `../layouts/Base.astro` and pass `title`, `description`, `robots` and `feed`. Lines marked `ADAPT:` are the places to change. Make these changes:

1. Point the import at the site's base layout.
2. Make sure status pages get `<meta name="robots" content="noindex, follow">`. If the layout has no `robots` prop, add the tag through whatever the layout offers for `<head>`.
3. Add a feed link to `<head>` on status pages: `<link rel="alternate" type="application/rss+xml" title="..." href="/status/feed.xml">`. If the layout has nowhere to put it, leave it out.
4. In `[slug].astro`, change `/404` if the site's 404 page has another path.

Until the layout accepts `robots` and `feed`, `astro check` reports a type error on those props. The pages still render, because Astro ignores props a component doesn't declare.

The pages use their own `incident-*` classes and don't depend on the theme's classes. You can change the markup to match the theme, but keep the `incident-*` classes that `incidents.css` styles.

## 5. Show the banner on every page

In the base layout, do the following:

1. Import the stylesheet, `IncidentBanner` and `currentIncident`.
2. Load the incidents. Don't load them a second time if middleware already did in step 6.
3. Render the banner as the first element inside `<body>`, before the site header.

```astro
---
import "../styles/incidents.css";
import IncidentBanner from "../components/IncidentBanner.astro";
import { loadIncidents } from "../lib/incident-data";
import { currentIncident } from "../lib/incidents";

const { incidents } = await loadIncidents();
const incident = currentIncident(incidents);
---
<body>
	{incident && <IncidentBanner incident={incident} />}
	<!-- the site's header, main and footer -->
</body>
```

If the layout renders `<EmDashBodyStart />`, put the banner right after it.

`loadIncidents()` returns no incidents, rather than an error, until the collection exists. So the layout can deploy before step 7.

## 6. Cache wiring (cached sites only)

Skip this step if `Astro.cache.enabled` is never true on the site.

On a cached site, every page that shows the banner must carry the incidents' cache hint. Publishing an incident purges every page tagged with that hint. A page without the hint keeps its old banner until the cache expires, and nothing reports an error. This is the step most likely to fail without a visible symptom.

Set the hint in middleware, not in the layout. Astro applies a response's cache settings when `next()` resolves, which happens before the layout renders, so cache calls made in a layout are silently dropped. The layout and the middleware should load the same data from one function, so the hints always match what the page shows:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { publicCache } from "./lib/cache-policy";
import { loadIncidents } from "./lib/incident-data";

export const onRequest = defineMiddleware(async (context, next) => {
	const response = await next();
	const cache = context.cache;
	if (!cache?.enabled) return response;
	const html = response.headers.get("content-type")?.startsWith("text/html") ?? false;
	// Only pages that tagged themselves with their content's hint are stored.
	if (!html || !cache.options.tags?.length) return response;
	const policy = publicCache(context);
	const { cacheHint } = await loadIncidents();
	if (!policy || response.status !== 200 || !cacheHint) {
		// Not stored: without the incidents' hint, nothing could purge the banner.
		cache.set(false);
		return response;
	}
	cache.set(cacheHint);
	// Also set here the hints for anything else the layout shows on every
	// page (site settings, menus), if the site doesn't already.
	cache.set(policy);
	return response;
});
```

If the site already has middleware, merge this logic into it. If its layout loads settings and menus, follow the same pattern for them. In the site this kit came from, one `loadLayoutData()` function returns settings, menus and incidents. The layout renders what it returns, and the middleware sets every hint it returns.

The status routes set their own hints and cache policy. Redirects and 404s are never stored.

## 7. Create the collection

Run the script's `schema` command against the site. It creates the collection and its fields from `scripts/incidents.schema.json`. Running it again updates fields whose label, `required` flag or validation has changed. It never deletes fields.

```bash
node scripts/incidents.ts --url http://localhost:4321 schema --dry-run
node scripts/incidents.ts --url http://localhost:4321 schema
node scripts/incidents.ts --url https://admin.example.com schema
```

The script needs Node 22.18 or later, which can run TypeScript directly.

For a local dev server, the script signs in through EmDash's setup bypass. For any other URL, it needs credentials:

- Set `EMDASH_HEADERS` to `Authorization: Bearer <token>`, using an EmDash API token (`ec_pat_...`) with permission to edit schema and content.
- If a Cloudflare Access app protects the admin, set `EMDASH_HEADERS` to a service token's two headers. Or have the site owner run `cloudflared access login https://<admin host>/_emdash/admin` first, and the script picks up that token.

You can create the collection by hand in the admin instead. In that case, copy every field from `incidents.schema.json`, including the labels, because they serve as the editor's instructions.

## 8. Verify

Run these checks on a local dev server, then again on production:

1. **Banner on.** Start a test incident: `node scripts/incidents.ts --url <site> start test-notice --title "Test notice" --banner "This is a test." --settle 0`. Every page, including `/`, shows the yellow banner. `/status/` redirects to `/status/test-notice/`.
2. **Update.** Run `node scripts/incidents.ts --url <site> update test-notice "First update."`. The update appears on `/status/test-notice/` with the time in the configured time zone.
3. **Admin stamp.** In the admin, add an update row with a message and a blank "Posted" time, then save. The time fills in, which shows the plugin is running.
4. **Feed and JSON.** `/status/feed.xml` is valid RSS with items for the start and the update. `/status/active.json` returns one notice with `"state": "ongoing"` and an `Access-Control-Allow-Origin: *` header.
5. **Resolve.** Run `node scripts/incidents.ts --url <site> resolve test-notice`. The banner turns green, and `active.json` shows `"state": "resolved"` with an `until` time.
6. **Cache purge (cached sites, production).** Load `/` twice, so the second response comes from the cache. Run `node scripts/incidents.ts --url <site> off test-notice`, wait a few seconds, and load `/` again. The banner must be gone. If it is still there, step 6 is wrong. Look for a page that is cached without the incidents' hint.
7. **Clean up.** Unpublish or delete the `test-notice` entry in the admin.

## Using it

Editors can work in the admin under **Incidents**. The field labels explain each field. The script does the same from a terminal, and every write publishes at once:

```text
node scripts/incidents.ts --url <site> list
node scripts/incidents.ts --url <site> start <slug> --title "…" --banner "…" [--started <ISO time>] [--contact phone,email] [--email <address>]
node scripts/incidents.ts --url <site> update <slug> "Message" [--at <ISO time>]
node scripts/incidents.ts --url <site> edit <slug> <n> "Message"
node scripts/incidents.ts --url <site> pin <slug> "Pinned note"
node scripts/incidents.ts --url <site> banner <slug> "New banner text"
node scripts/incidents.ts --url <site> on|off <slug>
node scripts/incidents.ts --url <site> resolve <slug> [--at <ISO time>]
node scripts/incidents.ts --url <site> unresolve <slug>
```

After each write, the script waits 45 seconds and publishes the entry again. The second publish purges any page that a cache stored while the first write was in progress. Without a cache in front of the site, pass `--settle 0`.

## What each piece depends on

- The banner shows the newest incident that is published, has "Show banner" checked, and is either unresolved or resolved less than `resolvedBannerHours` ago. Every render checks the time, so a resolved banner disappears without anyone switching it off. A cached page can still show it until the cache expires.
- An incident's email contact appears only when an alternate address is filled in. The site's usual email may be the thing that is down.
- `/status/active.json` uses the same rule as the banner, so the two always agree. Its fields are a contract with whoever reads it. Add fields freely, but don't rename or remove them once something depends on them.
