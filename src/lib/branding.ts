type BrandingEnv = Partial<Record<
  "NEXT_PUBLIC_BASEBUDDY_APP_NAME" | "NEXT_PUBLIC_BASEBUDDY_DOCS_URL" | "NEXT_PUBLIC_BASEBUDDY_SUPPORT_URL",
  string
>> &
  Record<string, string | undefined>;

const normalizeText = (value: string | undefined, fallback: string) => {
  const normalized = value?.trim();
  return normalized || fallback;
};

const normalizeHttpUrl = (value: string | undefined) => {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:" ? normalized : null;
  } catch {
    return null;
  }
};

const defaultDocsUrl = "https://basebuddy.stack127.com/docs";
const defaultSupportUrl = "https://basebuddy.stack127.com/support";

export const getBaseBuddyBranding = (env: BrandingEnv = process.env) => ({
  appName: normalizeText(env.NEXT_PUBLIC_BASEBUDDY_APP_NAME, "BaseBuddy"),
  docsUrl: normalizeHttpUrl(env.NEXT_PUBLIC_BASEBUDDY_DOCS_URL) ?? defaultDocsUrl,
  supportUrl: normalizeHttpUrl(env.NEXT_PUBLIC_BASEBUDDY_SUPPORT_URL) ?? defaultSupportUrl,
});

export const baseBuddyBranding = getBaseBuddyBranding();
