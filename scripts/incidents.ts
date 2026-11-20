// Service notices (src/lib/incidents.ts) from the command line: create the
// collection on a site, start an incident, post updates, take the banner down.
// The admin does all of this too (Incidents in the sidebar); this is for
// posting from a terminal, or by an agent, when the admin is a detour.
//
//   node scripts/incidents.ts --url <site> schema [--dry-run]
//   node scripts/incidents.ts --url <site> list
//   node scripts/incidents.ts --url <site> start <slug> --title "…" --banner "…" [--started 2026-11-12T13:00:00-05:00] [--contact phone,email] [--email addr]
//   node scripts/incidents.ts --url <site> update <slug> "Message" [--at 2026-11-13T07:15:00-05:00]
//   node scripts/incidents.ts --url <site> edit <slug> <n> "Message"     (rewords update n, 1 = first; keeps its time)
//   node scripts/incidents.ts --url <site> pin <slug> "Pinned note"     (an empty string clears it)
//   node scripts/incidents.ts --url <site> banner <slug> "New banner text"
//   node scripts/incidents.ts --url <site> on|off <slug>                 (show or hide the banner)
//   node scripts/incidents.ts --url <site> resolve <slug> [--at 2026-11-13T15:00:00-05:00]
//   node scripts/incidents.ts --url <site> unresolve <slug>
//   Any write command also takes [--settle seconds] (see below).
//
// Every write is published at once: these are public notices, not drafts.
// "start" turns the banner on. "on" turns off the banner of any other active
// incident first, so only one shows. "resolve" turns the banner green; it
// hides itself 24 hours after the Resolved time ("off" hides it sooner).
//
// After writing, the script waits --settle seconds (default 45, 0 skips) and
// publishes each changed entry again. Each publish purges the pages that show
// incidents from Workers Cache, but a purge only removes what is already
// stored: a page that started rendering before the write and finished after
// the purge is stored with the old banner (cloudflare/workerd#7732). The
// second publish purges those late copies. It changes nothing but the entry's
// revision. Without a cache in front of the site, pass --settle 0.
//
// Auth: a localhost URL uses the dev server's setup bypass. Any other URL needs
// EMDASH_HEADERS (newline-separated "Name: value" lines: an EmDash API token
// as "Authorization: Bearer <token>", or a Cloudflare Access service token's
// two headers). Without it, the script asks `cloudflared access token` for
// the token of a Cloudflare Access app in front of the admin.
//
// The collection's definition is scripts/incidents.schema.json; `schema`
// creates or updates it on a site.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createTransport, csrfInterceptor, EmDashClient } from "emdash/client";

import { accessHeaders } from "./access-headers.ts";

const INCIDENTS = "incidents";
const scriptDir = dirname(fileURLToPath(import.meta.url));

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		url: { type: "string" },
		"dry-run": { type: "boolean", default: false },
		title: { type: "string" },
		banner: { type: "string" },
		contact: { type: "string" },
		email: { type: "string" },
		at: { type: "string" },
		started: { type: "string" },
		settle: { type: "string", default: "45" },
	},
});
const [command, slug, text] = positionals;
if (!args.url || !command) {
	console.error(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n\n")[1]);
	process.exit(2);
}
const settleSeconds = Number(args.settle);
if (!Number.isFinite(settleSeconds) || settleSeconds < 0) {
	console.error(`--settle takes a number of seconds, not ${args.settle}.`);
	process.exit(2);
}
const baseUrl = args.url.replace(/\/+$/, "");
const isLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(baseUrl);

type Interceptor = (request: Request, next: (r: Request) => Promise<Response>) => Promise<Response>;

function localBypass(): Interceptor {
	// Access-auth sites have no /auth/dev-bypass route; the setup bypass sets the session.
	let cookie: Promise<string> | null = null;
	return async (request, next) => {
		cookie ??= fetch(`${baseUrl}/_emdash/api/setup/dev-bypass`, { redirect: "manual" }).then((r) =>
			r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
		);
		const headers = new Headers(request.headers);
		headers.set("Cookie", await cookie);
		return next(new Request(request, { headers }));
	};
}

function remoteHeaders(): Interceptor {
	const extra = accessHeaders(baseUrl);
	return async (request, next) => {
		const headers = new Headers(request.headers);
		extra.forEach((v, k) => headers.set(k, v));
		return next(new Request(request, { headers }));
	};
}

const auth = isLocal ? localBypass() : remoteHeaders();
const client = new EmDashClient({ baseUrl, interceptors: [auth] });
// The client has no call to change a field; schema() uses the API directly.
const api = createTransport({ interceptors: [auth, csrfInterceptor()] });

function need<T>(value: T | undefined, what: string): T {
	if (value === undefined || value === "") {
		console.error(`Missing ${what}.`);
		process.exit(2);
	}
	return value;
}

/** JSON with object keys sorted: the API returns a field's keys in its own order. */
const canonical = (v: unknown): string =>
	Array.isArray(v)
		? `[${v.map(canonical).join(",")}]`
		: v && typeof v === "object"
			? `{${Object.keys(v)
					.sort()
					.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
					.join(",")}}`
			: JSON.stringify(v ?? null);

/** The parts of a field definition incidents.schema.json sets and schema() keeps in step. */
const fieldShape = (f: Record<string, unknown>) => canonical({ label: f.label, required: f.required === true, validation: f.validation ?? null });

/** Creates the incidents collection and any missing fields, and updates changed ones, from incidents.schema.json. */
async function schema(dryRun: boolean) {
	const col = JSON.parse(readFileSync(join(scriptDir, "incidents.schema.json"), "utf8")) as {
		slug: string;
		label: string;
		labelSingular?: string;
		urlPattern?: string;
		supports?: string[];
		fields: Record<string, unknown>[];
	};
	if (col.slug !== INCIDENTS) throw new Error("incidents.schema.json is not the incidents collection");
	const exists = (await client.collections()).some((c) => c.slug === INCIDENTS);
	if (!exists) {
		console.log(`create collection ${INCIDENTS}`);
		if (!dryRun) {
			await client.createCollection({ slug: col.slug, label: col.label, labelSingular: col.labelSingular, urlPattern: col.urlPattern, supports: col.supports } as never);
		}
	}
	const have = new Map(exists ? (await client.collection(INCIDENTS)).fields.map((f) => [f.slug, f as unknown as Record<string, unknown>]) : []);
	for (const f of col.fields) {
		const live = have.get(f.slug as string);
		if (!live) {
			console.log(`create field ${INCIDENTS}.${f.slug} (${f.type})`);
			if (!dryRun) await client.createField(INCIDENTS, f as never);
			continue;
		}
		if (fieldShape(live) === fieldShape(f)) continue;
		console.log(`update field ${INCIDENTS}.${f.slug}`);
		if (dryRun) continue;
		const res = await api.fetch(
			new Request(`${baseUrl}/_emdash/api/schema/collections/${INCIDENTS}/fields/${f.slug}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: f.label, required: f.required === true, validation: f.validation ?? null }),
			}),
		);
		if (!res.ok) throw new Error(`Updating ${f.slug} failed: ${res.status} ${await res.text()}`);
	}
	console.log(dryRun ? "Dry run: nothing written." : "Schema is up to date.");
}

async function all() {
	const out = [];
	for await (const item of client.listAll(INCIDENTS, { limit: 100 })) out.push(item);
	return out;
}

async function find(s: string) {
	const item = (await all()).find((i) => i.slug === s);
	if (!item) throw new Error(`No incident with slug ${s}`);
	return client.get(INCIDENTS, item.id);
}

/** Entries this run published, to publish again once in-flight renders finish. */
const published = new Set<string>();

/** Writes changed fields and publishes, so the change is public at once. */
async function write(id: string, rev: string | undefined, data: Record<string, unknown>) {
	await client.update(INCIDENTS, id, { data, _rev: rev });
	await client.publish(INCIDENTS, id);
	published.add(id);
}

/** Publishes the changed entries again after --settle seconds, purging pages cached mid-write. */
async function settle() {
	if (published.size === 0 || settleSeconds === 0) return;
	console.log(`Waiting ${settleSeconds}s to purge pages that were rendering during the change…`);
	await new Promise((r) => setTimeout(r, settleSeconds * 1000));
	for (const id of published) await client.publish(INCIDENTS, id);
	console.log("Purged again.");
}

const contactList = (v: string | undefined) => (v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean));

switch (command) {
	case "schema":
		await schema(args["dry-run"]);
		break;
	case "list":
		for (const i of await all()) {
			const full = await client.get(INCIDENTS, i.id);
			const d = full.data as Record<string, unknown>;
			const n = Array.isArray(d.updates) ? d.updates.length : 0;
			console.log(`${i.slug}\t${i.status}\t${d.active ? "BANNER ON" : "banner off"}\t${d.resolved_at ? `resolved ${d.resolved_at}` : "ongoing"}\t${n} update(s)\t${d.title}`);
		}
		break;
	case "start": {
		const s = need(slug, "slug");
		const started = args.started ? new Date(args.started) : new Date();
		if (Number.isNaN(started.getTime())) throw new Error(`Not a time: ${args.started}`);
		const created = await client.create(INCIDENTS, {
			slug: s,
			status: "draft",
			data: {
				title: need(args.title, "--title"),
				banner: need(args.banner, "--banner"),
				started_at: started.toISOString(),
				active: true,
				link_updates: true,
				contact: contactList(args.contact) ?? ["phone"],
				contact_email: args.email ?? null,
				updates: [],
			},
		});
		await client.publish(INCIDENTS, created.id);
		published.add(created.id);
		console.log(`Published ${s} with the banner on.`);
		break;
	}
	case "update": {
		const item = await find(need(slug, "slug"));
		const at = args.at ? new Date(args.at) : new Date();
		if (Number.isNaN(at.getTime())) throw new Error(`Not a time: ${args.at}`);
		const updates = [...((item.data as { updates?: unknown[] }).updates ?? []), { posted_at: at.toISOString(), message: need(text, "message") }];
		await write(item.id, item._rev, { updates });
		console.log(`Posted update ${updates.length} to ${slug}.`);
		break;
	}
	case "edit": {
		// Rewords an update in place and keeps its posted time; the feed's guid
		// for an update is that time, so feed readers don't get a new item.
		const n = Number(need(text, "update number"));
		const message = need(positionals[3], "message");
		const item = await find(need(slug, "slug"));
		const updates = [...((item.data as { updates?: Record<string, unknown>[] }).updates ?? [])];
		if (!Number.isInteger(n) || !updates[n - 1]) throw new Error(`${slug} has no update ${text} (it has ${updates.length}).`);
		updates[n - 1] = { ...updates[n - 1], message };
		await write(item.id, item._rev, { updates });
		console.log(`Reworded update ${n} of ${slug}.`);
		break;
	}
	case "pin": {
		const item = await find(need(slug, "slug"));
		await write(item.id, item._rev, { pinned: text?.trim() ? text : null });
		console.log(text?.trim() ? `Pinned a note on ${slug}.` : `Cleared the pinned note on ${slug}.`);
		break;
	}
	case "banner": {
		const item = await find(need(slug, "slug"));
		await write(item.id, item._rev, { banner: need(text, "banner text") });
		console.log(`Changed the banner text of ${slug}.`);
		break;
	}
	case "resolve":
	case "unresolve": {
		const item = await find(need(slug, "slug"));
		const at = args.at ? new Date(args.at) : new Date();
		if (Number.isNaN(at.getTime())) throw new Error(`Not a time: ${args.at}`);
		await write(item.id, item._rev, { resolved_at: command === "resolve" ? at.toISOString() : null });
		console.log(command === "resolve" ? `Resolved ${slug} at ${at.toISOString()}; the green banner hides 24 hours later.` : `${slug} is ongoing again.`);
		break;
	}
	case "on":
	case "off": {
		const item = await find(need(slug, "slug"));
		if (command === "on") {
			for (const other of await all()) {
				if (other.id === item.id) continue;
				const full = await client.get(INCIDENTS, other.id);
				if ((full.data as { active?: unknown }).active) {
					await write(full.id, full._rev, { active: false });
					console.log(`Turned off the banner of ${other.slug}.`);
				}
			}
		}
		await write(item.id, item._rev, { active: command === "on" });
		console.log(`Banner ${command} for ${slug}.`);
		break;
	}
	default:
		console.error(`Unknown command ${command}`);
		process.exit(2);
}

await settle();
