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
  { href: "/dashboard/profile", label: "Profile", icon: "👤" },
  { href: "/dashboard/messages", label: "Messages", icon: "💬" },
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
    { href: "/dashboard/offers", label: "Sponsor offers", icon: "✨" },
  ],
  event: [
    { href: "/dashboard/events", label: "My events", icon: "🎫" },
    { href: "/dashboard/sponsored", label: "Sponsored events", icon: "🤝" },
    { href: "/dashboard/offers", label: "Sponsor offers", icon: "✨" },
  ],
  audience: [
    { href: "/dashboard/discover", label: "Discover events", icon: "🔎" },
    { href: "/dashboard/participations", label: "My events", icon: "🎟️" },
    { href: "/dashboard/rewards", label: "My rewards", icon: "🎁" },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Admin console", icon: "🛠️" },
  ],
};

export function navForRole(role: Role): NavItem[] {
  return [...COMMON_TOP, ...BY_ROLE[role], ...COMMON_BOTTOM];
}
