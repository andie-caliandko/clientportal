import type { Metadata } from "next";
import { BrandStyle } from "@/lib/brand";
import { getPublicAgency, getViewer } from "@/lib/session";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const agency = (await getViewer())?.agency ?? (await getPublicAgency());
  return { title: agency ? `${agency.name} · Client Portal` : "Client Portal" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const agency = (await getViewer())?.agency ?? (await getPublicAgency());
  return (
    <html lang="en">
      <head>
        <BrandStyle brand={agency?.brand ?? {}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
