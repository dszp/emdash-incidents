import { describe, expect, it } from "vitest";

import { stampUpdateTimes } from "./stamp";

const NOW = new Date("2026-11-13T20:30:00Z");

describe("stampUpdateTimes", () => {
	it("stamps an update with a message and no time", () => {
		const out = stampUpdateTimes({ title: "T", updates: [{ posted_at: "", message: "New." }] }, NOW);
		expect(out).toEqual({ title: "T", updates: [{ posted_at: "2026-11-13T20:30:00.000Z", message: "New." }] });
	});

	it("treats a missing or null time as blank", () => {
		const out = stampUpdateTimes({ updates: [{ message: "a" }, { posted_at: null, message: "b" }] }, NOW);
		expect(out?.updates).toEqual([
			{ message: "a", posted_at: "2026-11-13T20:30:00.000Z" },
			{ posted_at: "2026-11-13T20:30:00.000Z", message: "b" },
		]);
	});

	it("keeps a time that is already set", () => {
		const content = { updates: [{ posted_at: "2026-11-12T18:00:00.000Z", message: "Old." }] };
		expect(stampUpdateTimes(content, NOW)).toBeNull();
	});

	it("leaves an empty row for the editor to fill or remove", () => {
		expect(stampUpdateTimes({ updates: [{ posted_at: "", message: "  " }] }, NOW)).toBeNull();
	});

	it("stamps only the blank rows in a mixed list", () => {
		const out = stampUpdateTimes(
			{
				updates: [
					{ posted_at: "2026-11-12T18:00:00.000Z", message: "Old." },
					{ posted_at: "", message: "New." },
				],
			},
			NOW,
		);
		expect(out?.updates).toEqual([
			{ posted_at: "2026-11-12T18:00:00.000Z", message: "Old." },
			{ posted_at: "2026-11-13T20:30:00.000Z", message: "New." },
		]);
	});

	it("ignores a save without updates", () => {
		expect(stampUpdateTimes({ banner: "Changed." }, NOW)).toBeNull();
	});
});
