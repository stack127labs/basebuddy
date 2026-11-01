type BrandingEnv = Record<string, string | undefined>;

export type BaseBuddyBranding = {
  appName: string;
  docsUrl: string;
  supportUrl: string;
};

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

export const defaultBaseBuddyBranding: BaseBuddyBranding = {
  appName: "BaseBuddy",
  docsUrl: "https://basebuddy.stack127.com/docs",
  supportUrl: "https://basebuddy.stack127.com/support",
};

// Read at request time on the server so one published Docker image can be
// configured by env. The legacy NEXT_PUBLIC_* names are read the same way.
const readRuntimeValue = (env: BrandingEnv, name: string) => {
  const value = env[`BASEBUDDY_${name}`];
  return value?.trim() ? value : env[`NEXT_PUBLIC_BASEBUDDY_${name}`];
};

export const getBaseBuddyBranding = (env: BrandingEnv = process.env): BaseBuddyBranding => ({
  appName: normalizeText(readRuntimeValue(env, "APP_NAME"), defaultBaseBuddyBranding.appName),
  docsUrl: normalizeHttpUrl(readRuntimeValue(env, "DOCS_URL")) ?? defaultBaseBuddyBranding.docsUrl,
  supportUrl: normalizeHttpUrl(readRuntimeValue(env, "SUPPORT_URL")) ?? defaultBaseBuddyBranding.supportUrl,
});
