import type { Role } from "./constants";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // emoji glyph for the MVP; swap for an icon set later
}

const COMMON_TOP: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
];

const COMMON_BOTTOM: NavItem[] = [
  { href: "/dashboard/notifications", label: "Notifications", icon: "🔔" },
  { href: "/dashboard/profile", label: "Profile", icon: "👤" },
  { href: "/dashboard/messages", label: "Messages", icon: "💬" },
  { href: "/dashboard/resources", label: "Repository", icon: "📚" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

const BY_ROLE: Record<Role, NavItem[]> = {
  brand: [
    { href: "/dashboard/campaigns", label: "Campaigns", icon: "📣" },
    { href: "/dashboard/sponsored", label: "Sponsored events", icon: "🤝" },
    { href: "/dashboard/discover", label: "Discover events", icon: "🔎" },
  ],
  artist: [
    { href: "/dashboard/events", label: "My events", icon: "🎫" },
    { href: "/dashboard/sponsored", label: "Sponsored events", icon: "🤝" },
    {
      href: "/dashboard/discover-campaigns",
      label: "Discover campaigns",
      icon: "🔎",
    },
    { href: "/dashboard/offers", label: "Sponsor offers", icon: "✨" },
  ],
  event: [
    { href: "/dashboard/events", label: "My events", icon: "🎫" },
    { href: "/dashboard/sponsored", label: "Sponsored events", icon: "🤝" },
    {
      href: "/dashboard/discover-campaigns",
      label: "Discover campaigns",
      icon: "🔎",
    },
    { href: "/dashboard/offers", label: "Sponsor offers", icon: "✨" },
  ],
  audience: [
    { href: "/dashboard/discover", label: "Discover events", icon: "🔎" },
    { href: "/dashboard/participations", label: "My events", icon: "🎟️" },
    { href: "/dashboard/rewards", label: "My rewards", icon: "🎁" },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Overview", icon: "📊" },
    { href: "/dashboard/admin/users", label: "Users", icon: "👥" },
    { href: "/dashboard/admin/campaigns", label: "Campaigns", icon: "📣" },
    { href: "/dashboard/admin/campaigns/intake", label: "Campaign requests", icon: "📥" },
    { href: "/dashboard/admin/events", label: "Events", icon: "🎫" },
    { href: "/dashboard/admin/participants", label: "Participants", icon: "🎟️" },
    { href: "/dashboard/admin/surveys", label: "Surveys", icon: "📝" },
    { href: "/dashboard/admin/surveys/responses", label: "Survey responses", icon: "🔍" },
    { href: "/dashboard/admin/enquiries", label: "Enquiries", icon: "📨" },
    { href: "/dashboard/admin/feedback", label: "Feedback", icon: "🐞" },
    // Distinct from the personal inbox in COMMON_BOTTOM — this is the config.
    { href: "/dashboard/admin/notifications", label: "Notification setup", icon: "🔔" },
    { href: "/dashboard/admin/plans", label: "Plans", icon: "💳" },
    { href: "/dashboard/admin/packages", label: "Packages", icon: "📦" },
    { href: "/dashboard/admin/invoices", label: "Invoices", icon: "🧾" },
  ],
};

export function navForRole(role: Role): NavItem[] {
  // Admins are redirected off /dashboard onto /dashboard/admin, so the shared
  // "Overview" entry would be a dead duplicate of the admin one.
  if (role === "admin") {
    return [...BY_ROLE.admin, ...COMMON_BOTTOM];
  }
  return [...COMMON_TOP, ...BY_ROLE[role], ...COMMON_BOTTOM];
}

/** Nav hrefs that should only highlight on an exact match, not for children. */
export const EXACT_NAV_HREFS = new Set(["/dashboard", "/dashboard/admin"]);
