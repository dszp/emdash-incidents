# emdash-incidents

Outage notices for an [EmDash](https://github.com/emdash-cms/emdash) site: a banner on every page, an updates page for each incident, an RSS feed, and a JSON endpoint that other sites and apps can read to show the same banner.

This is a kit of files you copy into your site, not a package you install. Your site's layout decides where the banner goes and how pages are cached, so a few lines of wiring stay in your hands. [INSTALL.md](INSTALL.md) lists every step. It is written so you can hand it to a coding agent.

## What you get

- **Incidents collection.** Editors write incidents in the EmDash admin: a title, banner text, start and resolved times, a contact choice, a pinned note, and a list of timed updates.
- **Banner.** It's yellow while an incident is ongoing and turns green when you set a Resolved time. It hides itself 24 hours later.
- **Status pages.** `/status/<slug>/` shows one incident's updates, newest first. `/status/` redirects to the current incident, or lists past ones.
- **Feeds.**
  - `/status/feed.xml` is an RSS feed with an item for each start, update and resolution.
  - `/status/active.json` returns what the banner shows right now, with CORS open so a portal or docs site can show the same banner.
- **Command-line script.** `scripts/incidents.ts` creates the collection and starts, updates, rewords, resolves and hides incidents from a terminal or an agent.
- **`incident-times` plugin.** It fills in an update's time when an editor leaves it blank.

## Requirements

- An EmDash site. The kit runs in production on EmDash 1.5 with Cloudflare Workers and Workers Cache, and has been installed on EmDash 0.39 with the Node adapter.
- Node 22.18 or later to run the script.

## Caching

On a site with Astro's route cache (Cloudflare Workers Cache), every page must carry the incidents' cache hint so that publishing an incident purges it. INSTALL.md step 6 covers this, and step 8 tests it. Sites without a cache can skip both.

## License

[MIT](LICENSE)
