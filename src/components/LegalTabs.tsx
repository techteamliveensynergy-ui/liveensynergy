import Link from "next/link";

const TABS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
];

export function LegalTabs({ active }: { active: "/terms" | "/privacy" | "/cookies" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            tab.href === active
              ? "bg-[var(--color-les-lime)] text-[var(--color-les-ink)]"
              : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
