// Incident text fields are plain text. A link written in them as
// [label](url) becomes a link; everything else stays text, which Astro escapes.
// An unsafe URL (javascript: and the like) leaves the label as plain text.

import { sanitizeHref } from "./safe-href";

/** Absolute http(s) links open in a new tab; links within the site don't. */
const opensNewTab = (href: string) => /^https?:\/\//i.test(href);

export type InlinePart = { text: string } | { text: string; href: string; newTab: boolean };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function inlineLinks(source: string): InlinePart[] {
	const parts: InlinePart[] = [];
	let last = 0;
	for (const match of source.matchAll(LINK)) {
		const [whole, text, url] = match;
		if (match.index > last) parts.push({ text: source.slice(last, match.index) });
		const href = sanitizeHref(url);
		parts.push(href ? { text, href, newTab: opensNewTab(href) } : { text });
		last = match.index + whole.length;
	}
	if (last < source.length) parts.push({ text: source.slice(last) });
	return parts;
}
