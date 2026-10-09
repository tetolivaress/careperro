/** Brand and deployment constants. */
export const SITE = {
  name: "Lokal",
  domain: "careperroshouse.com",
  url: "https://www.careperroshouse.com",
  tagline: "Edit any file. Upload nothing.",
  description:
    "Free tools for images, audio, video, PDFs and code that run entirely in your browser. No uploads, no sign-up, no ads.",
  locales: ["en", "es"] as const,
  defaultLocale: "en" as const,
} as const;
