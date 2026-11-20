// Everything site-specific in the incident kit. Edit these values for your
// site; nothing else in the kit names a business, a time zone or a URL.

export const INCIDENT_CONFIG = {
	/** The time zone update times are shown in (an IANA name). */
	timeZone: "America/New_York",
	/** The locale for formatting times, e.g. "Nov 13, 2026, 6:42 AM EST". */
	locale: "en-US",
	/** How long the green "resolved" banner stays up after the Resolved time. */
	resolvedBannerHours: 24,
	/**
	 * The phone number an incident can show when its Contact field includes
	 * "phone". Set to null if you never show a phone number.
	 */
	phone: { label: "555-555-0100", href: "tel:+15555550100" } as { label: string; href: string } | null,
	/**
	 * A live status page (Statuspage, UptimeRobot and the like) that /status/
	 * links to when no incident is active. Null leaves the link out.
	 */
	statusPageUrl: null as string | null,
	/** The feed's name; the site title from EmDash's settings goes in front. */
	feedTitle: "Service notices",
} as const;
