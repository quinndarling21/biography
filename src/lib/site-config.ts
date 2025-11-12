import type { Metadata } from "next";

export type SiteLinkMap = {
  github?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  [key: string]: string | undefined;
};

export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  keywords: string[];
  author: {
    name: string;
    email: string;
  };
  contact: {
    location: string;
    availability: string;
    links: SiteLinkMap;
  };
};

export const siteConfig: SiteConfig = {
  name: "Biography",
  description:
    "Story-first web app skeleton for sharing career moments, milestones, and in-progress work.",
  url: "https://biography-template.vercel.app",
  keywords: [
    "biography",
    "personal site",
    "portfolio",
    "next.js",
    "tailwindcss",
    "vercel",
  ],
  author: {
    name: "Quinn Darling",
    email: "hello@biography.app",
  },
  contact: {
    location: "Remote • Global",
    availability: "Open to collaborations and advisory projects.",
    links: {
      github: "https://github.com/quinndarling",
      linkedin: "https://www.linkedin.com/in/quinndarling",
      twitter: "https://x.com/quinndarling",
    },
  },
};

export const baseMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} · ${siteConfig.description}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  authors: [{ name: siteConfig.author.name }],
};
