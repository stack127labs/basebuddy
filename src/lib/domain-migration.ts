const legacyDemoHost = "demo.basebuddycms.com";

const normalizeHost = (hostHeader: string | null) =>
  hostHeader?.split(",", 1)[0]?.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "") ?? null;

export const getDemoDomainRedirect = (requestUrl: URL, hostHeader: string | null) => {
  if (normalizeHost(hostHeader) !== legacyDemoHost) {
    return null;
  }

  const redirectUrl = new URL(requestUrl.toString());
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = "basebuddy-demo.stack127.com";
  redirectUrl.port = "";
  return redirectUrl;
};
