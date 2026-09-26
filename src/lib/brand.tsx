import type { Brand } from "./types";

const FALLBACK = {
  cream: "#F6F0EA",
  sage: "#D0E1DD",
  stone: "#B3BDBB",
  khaki: "#CDCB9F",
  primary: "#364E4A",
  accent: "#724708",
};

// Google Fonts rejects the whole request if you ask for a weight a family
// doesn't have, so list the styles for families we know. Others load regular only.
const FONT_AXES: Record<string, string> = {
  "Instrument Serif": ":ital@0;1",
  "Instrument Sans": ":wght@400;500;600;700",
  Poppins: ":wght@400;500;600",
  Inter: ":wght@400;500;600;700",
  Lora: ":ital,wght@0,400;0,600;1,400",
  "Playfair Display": ":ital,wght@0,400;0,600;1,400",
  "DM Sans": ":wght@400;500;700",
  Montserrat: ":wght@400;500;600;700",
};

/**
 * CSS variables for an agency's brand. The stylesheet builds every surface and
 * text color from these, so each agency's portal picks up its own palette.
 */
export function BrandStyle({ brand }: { brand: Brand }) {
  // Brand values come from each agency's settings, so only let through safe
  // hex colors and plain font names before they go into CSS.
  const color = (v: string | undefined, d: string) => (v && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
  const font = (v: string | undefined, d: string) => (v && /^[\w \-]{1,60}$/.test(v) ? v : d);
  const bc = brand.colors ?? {};
  const c = Object.fromEntries(
    Object.entries(FALLBACK).map(([k, d]) => [k, color(bc[k as keyof typeof FALLBACK], d)]),
  ) as typeof FALLBACK;
  const f = {
    heading: font(brand.fonts?.heading, "Instrument Serif"),
    label: font(brand.fonts?.label, "Poppins"),
    body: font(brand.fonts?.body, "Instrument Sans"),
  };
  // html:root outranks the defaults in globals.css regardless of stylesheet order.
  const css = `html:root{--cream:${c.cream};--sage:${c.sage};--stone:${c.stone};--khaki:${c.khaki};--primary:${c.primary};--accent-brand:${c.accent};--font-heading:"${f.heading}";--font-label:"${f.label}";--font-body:"${f.body}";}`;
  const families = [...new Set([f.heading, f.label, f.body])]
    .map((name) => `family=${name.replace(/ /g, "+")}${FONT_AXES[name] ?? ""}`)
    .join("&");
  return (
    <>
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${families}&display=swap`} />
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}

/** Agency logo that swaps to the light version in dark mode. */
export function Logo({ brand, name, variant = "logo", height = 48 }: {
  brand: Brand;
  name: string;
  variant?: "logo" | "mark";
  height?: number;
}) {
  const light = variant === "logo" ? brand.logo : brand.mark;
  const dark = variant === "logo" ? brand.logoOnDark : brand.markOnDark;
  if (!light) return <span className="wordmark">{name}</span>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="only-light" src={light} alt={name} style={{ height, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="only-dark" src={dark ?? light} alt={name} style={{ height, width: "auto" }} />
    </>
  );
}
