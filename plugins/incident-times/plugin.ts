// Stamps blank "Posted" times on incident updates when an incident is saved
// (stamp.ts). Runs for every save path: the admin, the API and
// scripts/incidents.ts, which sets its own time and so is never stamped.

import { definePlugin } from "emdash";

import { INCIDENTS, stampUpdateTimes } from "./stamp";

export const PLUGIN_ID = "incident-times";

// EmDash loads the named createPlugin export from this entrypoint.
export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: "1.0.0",
		// content:beforeSave needs content:write; without it the hook is
		// skipped at registration without an error.
		capabilities: ["content:write"],
		hooks: {
			"content:beforeSave": async (event) => {
				if (event.collection !== INCIDENTS) return;
				return stampUpdateTimes(event.content, new Date()) ?? undefined;
			},
		},
	});
}

export default createPlugin;
