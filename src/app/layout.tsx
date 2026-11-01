import type { ReactNode } from "react";
import type { Metadata } from "next";
import { BrandingProvider } from "@/components/branding-provider";
import { getBaseBuddyBranding } from "@/lib/branding";
import { getSiteRobotsMetadata } from "@/lib/site-indexing";

import "./globals.css";

import { Providers } from "./providers";

// CSP nonces are generated per request in middleware, so every page must render
// through the request pipeline instead of using build-time static HTML.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const { appName } = getBaseBuddyBranding();

  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: "A content editor for connected content.",
    icons: {
      icon: "/basebuddy-icon.svg",
    },
    robots: getSiteRobotsMetadata(),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <BrandingProvider branding={getBaseBuddyBranding()}>
          <Providers>{children}</Providers>
        </BrandingProvider>
      </body>
    </html>
  );
}
