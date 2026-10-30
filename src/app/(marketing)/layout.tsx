import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/** Every public page sits inside .les-site, the site theme (#82, globals.css). */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="les-site min-h-screen">
      <SiteHeader />
      <main className="min-h-[60vh]">{children}</main>
      <SiteFooter />
    </div>
  );
}
