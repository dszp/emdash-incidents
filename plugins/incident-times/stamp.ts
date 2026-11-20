// Fills a blank "Posted" time on an incident update with the save time, so
// an editor in the admin can add an update without typing the time. A time
// that is already set is kept: backdating and corrections still work.

export const INCIDENTS = "incidents";

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * The incident's fields with every update that has a message but no Posted
 * time stamped with `now`, or null when nothing needs stamping. Only the
 * `updates` field is touched; a save that doesn't include it is left alone.
 */
export function stampUpdateTimes(content: Record<string, unknown>, now: Date): Record<string, unknown> | null {
	const updates = content.updates;
	if (!Array.isArray(updates)) return null;
	let changed = false;
	const stamped = updates.map((row) => {
		if (!row || typeof row !== "object") return row;
		const r = row as Record<string, unknown>;
		if (!blank(r.posted_at) || blank(r.message)) return row;
		changed = true;
		return { ...r, posted_at: now.toISOString() };
	});
	return changed ? { ...content, updates: stamped } : null;
}
