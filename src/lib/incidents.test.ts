import { describe, expect, it } from "vitest";
import { contactLinks, currentIncident, feedItems, formatTime, showsBanner, toIncident, type Incident } from "./incidents";

const entry = (id: string, data: Record<string, unknown>) => ({ id, data });
const PHONE = { label: "317-555-0100", href: "tel:+13175550100" };

describe("toIncident", () => {
	it("sorts updates newest first and drops incomplete rows", () => {
		const i = toIncident(
			entry("m365", {
				title: "Microsoft 365 outage",
				updates: [
					{ posted_at: "2026-11-13T11:00:00Z", message: "First." },
					{ posted_at: "2026-11-13T13:00:00Z", message: "Third." },
					{ posted_at: "not a date", message: "Bad time." },
					{ posted_at: "2026-11-13T12:00:00Z", message: "  " },
					{ posted_at: new Date("2026-11-13T12:30:00Z"), message: "Second." },
					null,
				],
			}),
		);
		expect(i.updates.map((u) => u.message)).toEqual(["Third.", "Second.", "First."]);
	});

	it("falls back to the title for the banner and defaults the link on", () => {
		const i = toIncident(entry("x", { title: "Outage" }));
		expect(i.banner).toBe("Outage");
		expect(i.linkUpdates).toBe(true);
		expect(i.active).toBe(false);
	});

	it("starts at the Started field, else when it was published", () => {
		expect(toIncident(entry("x", { started_at: "2026-11-12T18:00:00Z", publishedAt: new Date("2026-11-13T12:00:00Z") })).startedAt?.toISOString()).toBe(
			"2026-11-12T18:00:00.000Z",
		);
		expect(toIncident(entry("x", { publishedAt: new Date("2026-11-13T12:00:00Z") })).startedAt?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
	});

	it("reads the Resolved time, null when blank", () => {
		expect(toIncident(entry("x", { resolved_at: "2026-11-13T19:30:00Z" })).resolvedAt?.toISOString()).toBe("2026-11-13T19:30:00.000Z");
		expect(toIncident(entry("x", { resolved_at: "" })).resolvedAt).toBeNull();
	});

	it("reads booleans stored as 0/1", () => {
		const i = toIncident(entry("x", { title: "T", active: 1, link_updates: 0 }));
		expect(i.active).toBe(true);
		expect(i.linkUpdates).toBe(false);
	});

	it("keeps only known contact methods and a plausible email", () => {
		expect(toIncident(entry("x", { contact: ["phone", "fax", "phone"] })).contact).toEqual(["phone"]);
		expect(toIncident(entry("x", { contact_email: "not an email" })).contactEmail).toBeNull();
		expect(toIncident(entry("x", { contact_email: " help@example.net " })).contactEmail).toBe("help@example.net");
	});
});

describe("contactLinks", () => {
	it("shows the phone when chosen", () => {
		expect(contactLinks({ contact: ["phone"], contactEmail: null }, PHONE)).toEqual([{ method: "phone", ...PHONE }]);
	});
	it("shows email only once an address is entered", () => {
		expect(contactLinks({ contact: ["email"], contactEmail: null }, PHONE)).toEqual([]);
		expect(contactLinks({ contact: ["email", "phone"], contactEmail: "a@b.co" }, PHONE).map((l) => l.method)).toEqual(["phone", "email"]);
	});
	it("shows nothing when no method is chosen", () => {
		expect(contactLinks({ contact: [], contactEmail: "a@b.co" }, PHONE)).toEqual([]);
	});
});

const inc = (slug: string, over: Partial<Incident>): Incident => ({
	slug,
	title: slug,
	banner: slug,
	active: false,
	linkUpdates: true,
	contact: [],
	contactEmail: null,
	pinned: null,
	updates: [],
	startedAt: null,
	resolvedAt: null,
	publishedAt: null,
	updatedAt: null,
	...over,
});

describe("currentIncident", () => {
	it("is the newest active incident", () => {
		const list = [
			inc("old", { active: true, startedAt: new Date("2026-01-01") }),
			inc("new", { active: true, startedAt: new Date("2026-11-13") }),
			inc("off", { active: false, startedAt: new Date("2026-12-01") }),
		];
		expect(currentIncident(list)?.slug).toBe("new");
	});
	it("is null when nothing is active", () => {
		expect(currentIncident([inc("off", {})])).toBeNull();
	});
	it("passes over one resolved more than 24 hours ago", () => {
		const list = [
			inc("older", { active: true, startedAt: new Date("2026-11-01") }),
			inc("done", { active: true, startedAt: new Date("2026-11-12"), resolvedAt: new Date("2026-11-12T12:00:00Z") }),
		];
		expect(currentIncident(list, new Date("2026-11-13T11:00:00Z"))?.slug).toBe("done");
		expect(currentIncident(list, new Date("2026-11-13T13:00:00Z"))?.slug).toBe("older");
	});
});

describe("showsBanner", () => {
	const resolvedAt = new Date("2026-11-13T19:00:00Z");
	it("shows an active, unresolved incident", () => {
		expect(showsBanner({ active: true, resolvedAt: null })).toBe(true);
	});
	it("never shows an inactive one", () => {
		expect(showsBanner({ active: false, resolvedAt: null })).toBe(false);
		expect(showsBanner({ active: false, resolvedAt }, resolvedAt)).toBe(false);
	});
	it("keeps a resolved one up for 24 hours, then drops it", () => {
		expect(showsBanner({ active: true, resolvedAt }, new Date("2026-11-14T18:59:59Z"))).toBe(true);
		expect(showsBanner({ active: true, resolvedAt }, new Date("2026-11-14T19:00:00Z"))).toBe(false);
	});
});

describe("feedItems", () => {
	it("interleaves starts and updates across incidents, newest first", () => {
		const items = feedItems(
			[
				inc("a", { title: "A", startedAt: new Date("2026-11-13T10:00:00Z"), updates: [{ postedAt: new Date("2026-11-13T12:00:00Z"), message: "a1" }] }),
				inc("b", { title: "B", startedAt: new Date("2026-11-13T11:00:00Z") }),
				inc("draftish", { title: "No date" }),
			],
			"https://example.com",
		);
		expect(items.map((i) => i.guid)).toEqual([
			"https://example.com/status/a/#2026-11-13T12:00:00.000Z",
			"https://example.com/status/b/#start",
			"https://example.com/status/a/#start",
		]);
	});
	it("adds an item when an incident is resolved", () => {
		const items = feedItems([inc("a", { title: "A", banner: "All clear.", resolvedAt: new Date("2026-11-13T19:00:00Z") })], "https://e.com");
		expect(items).toEqual([
			{ title: "A: resolved", link: "https://e.com/status/a/", guid: "https://e.com/status/a/#resolved-2026-11-13T19:00:00.000Z", date: new Date("2026-11-13T19:00:00Z"), description: "All clear." },
		]);
	});
	it("respects the limit", () => {
		const updates = Array.from({ length: 10 }, (_, n) => ({ postedAt: new Date(Date.UTC(2026, 0, n + 1)), message: `u${n}` }));
		expect(feedItems([inc("a", { updates })], "https://e.com", 3)).toHaveLength(3);
	});
});

describe("formatTime", () => {
	it("shows Eastern time", () => {
		expect(formatTime(new Date("2026-11-13T11:42:00Z"))).toBe("Nov 13, 2026, 6:42 AM EST");
	});
});
