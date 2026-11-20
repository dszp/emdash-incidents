// Registers the incident update time stamper in astro.config.mjs:
//   emdash({ plugins: [incidentTimes()] })
import { fileURLToPath } from "node:url";

import type { PluginDescriptor } from "emdash";

export function incidentTimes(): PluginDescriptor {
	return {
		id: "incident-times",
		version: "1.0.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
	};
}
