import { describe, expect, it } from "vitest";
import { activeNotices } from "./active-notices";
import type { Incident } from "./incidents";

const inc = (slug: string, over: Partial<Incident>): Incident => ({
	slug,
	title: slug,
	banner: slug,
	active: true,
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
const NOW = new Date("2026-11-13T20:00:00Z");
const O = "https://example.com";
const PHONE = { label: "317-555-0100", href: "tel:+13175550100" };

describe("activeNotices", () => {
	it("is empty when no banner is up", () => {
		expect(activeNotices([inc("off", { active: false })], O, PHONE, NOW)).toEqual({ updated: NOW.toISOString(), notices: [] });
	});
	it("describes an ongoing incident as the banner shows it", () => {
		const { notices } = activeNotices(
			[
				inc("m365", {
					title: "Microsoft 365 outage",
					banner: "Email is delayed. [Details](/status/m365/)",
					startedAt: new Date("2026-11-13T10:00:00Z"),
					updates: [{ postedAt: new Date("2026-11-13T12:00:00Z"), message: "x" }],
				}),
			],
			O,
			PHONE,
			NOW,
		);
		expect(notices).toEqual([
			{
				id: "m365",
				title: "Microsoft 365 outage",
				state: "ongoing",
				summary: "Email is delayed. Details",
				url: "https://example.com/status/m365/",
				started: "2026-11-13T10:00:00.000Z",
				updated: "2026-11-13T12:00:00.000Z",
				until: null,
				contacts: [],
			},
		]);
	});
	it("keeps a resolved incident until its banner comes down, and says when", () => {
		const resolved = inc("r", { resolvedAt: new Date("2026-11-13T19:00:00Z") });
		const [n] = activeNotices([resolved], O, PHONE, NOW).notices;
		expect(n?.state).toBe("resolved");
		expect(n?.until).toBe("2026-11-14T19:00:00.000Z");
		expect(activeNotices([resolved], O, PHONE, new Date("2026-11-14T19:00:01Z")).notices).toEqual([]);
	});
	it("lists the banner's contact links: phone, then the alternate email", () => {
		const [n] = activeNotices([inc("c", { contact: ["email", "phone"], contactEmail: "alt@example.net" })], O, PHONE, NOW).notices;
		expect(n?.contacts).toEqual([
			{ method: "phone", label: "317-555-0100", href: "tel:+13175550100" },
			{ method: "email", label: "alt@example.net", href: "mailto:alt@example.net" },
		]);
	});
	it("shows only the incident the banner shows: the newest", () => {
		const { notices } = activeNotices(
			[inc("old", { startedAt: new Date("2026-11-12T00:00:00Z") }), inc("new", { startedAt: new Date("2026-11-13T00:00:00Z") })],
			O,
			PHONE,
			NOW,
		);
		expect(notices.map((n) => n.id)).toEqual(["new"]);
	});
});
