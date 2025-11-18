import { PageContainer } from "@/components/common/PageContainer";
import { siteConfig } from "@/lib/site-config";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const socialLinks = Object.entries(siteConfig.contact.links).filter(
    ([, url]) => Boolean(url),
  );

  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-white/70">
      <PageContainer className="flex flex-col gap-6 py-10 text-sm text-[var(--color-text-secondary)] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-[var(--color-text-strong)]">
            {siteConfig.name}
          </p>
          <p>{siteConfig.contact.location}</p>
          <p className="mt-1 text-xs">
            © {year} {siteConfig.author.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {socialLinks.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-[var(--color-text-strong)]"
            >
              {label}
            </a>
          ))}
        </div>
      </PageContainer>
    </footer>
  );
}
