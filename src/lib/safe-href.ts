/** An href safe to render: http(s), mailto, tel, or site-relative; otherwise null. */
export function sanitizeHref(href: string): string | null {
	const value = href.trim();
	if (/^(\/(?!\/)|#|\?)/.test(value)) return value;
	try {
		const url = new URL(value);
		return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? value : null;
	} catch {
		return null;
	}
}
