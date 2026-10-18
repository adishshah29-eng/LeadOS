import { Archivo } from "next/font/google";

/**
 * Display face for marketing pages: Archivo at a condensed width, in the
 * spirit of the bold painted lettering on taxi roof signs. Self-hosted by
 * next/font, so the CSP can keep font-src 'self'. App screens stay on Geist.
 */
export const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
