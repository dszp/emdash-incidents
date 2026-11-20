// Request headers that let a script write to a site: EMDASH_HEADERS
// (newline-separated "Name: value" lines, such as an EmDash API token or a
// Cloudflare Access service token), or, when that is empty, the browser-login
// token `cloudflared access token` has cached for a Cloudflare Access app in
// front of the admin. Tokens are passed along, never printed.

import { execFileSync } from "node:child_process";

export function accessHeaders(baseUrl: string): Headers {
	const headers = new Headers();
	for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
		const i = line.indexOf(":");
		if (i > 0) headers.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
	}
	if (![...headers.keys()].length) {
		// Name the admin path, not the bare host: the Access app protects
		// /_emdash, and a site that redirects its admin host's other paths
		// would send cloudflared somewhere else.
		const app = `${baseUrl}/_emdash/admin`;
		let token = "";
		try {
			token = execFileSync("cloudflared", ["access", "token", `-app=${app}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
		} catch {
			// No cloudflared, or no token cached for this app.
		}
		if (!token || token.includes(" ")) {
			throw new Error(
				`No credentials for ${baseUrl}. Set EMDASH_HEADERS (e.g. "Authorization: Bearer <EmDash API token>"), ` +
					`or, behind Cloudflare Access, run: cloudflared access login ${app}`,
			);
		}
		headers.set("cf-access-token", token);
	}
	return headers;
}
