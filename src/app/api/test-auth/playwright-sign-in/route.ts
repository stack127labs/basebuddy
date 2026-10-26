import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSafeNextPath } from "@/lib/auth/redirects";
import { createLocalAuthenticatedSession } from "@/lib/auth/local-auth";
import { authenticateBaseBuddyConfigUser } from "@/lib/basebuddy-config/auth";

const playwrightRoleSchema = z.enum(["owner", "admin", "editor", "author", "viewer"]);

const getPlaywrightRoleCredentials = (
  role: z.infer<typeof playwrightRoleSchema>,
): { email: string; password: string } | null => {
  const credentialsByRole = {
    admin: {
      email: process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim() ?? "",
      password: process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim() ?? "",
    },
    author: {
      email: process.env.PLAYWRIGHT_AUTHOR_EMAIL?.trim() ?? "",
      password: process.env.PLAYWRIGHT_AUTHOR_PASSWORD?.trim() ?? "",
    },
    editor: {
      email: process.env.PLAYWRIGHT_EDITOR_EMAIL?.trim() ?? "",
      password: process.env.PLAYWRIGHT_EDITOR_PASSWORD?.trim() ?? "",
    },
    owner: {
      email: process.env.PLAYWRIGHT_OWNER_EMAIL?.trim() ?? "",
      password: process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim() ?? "",
    },
    viewer: {
      email: process.env.PLAYWRIGHT_VIEWER_EMAIL?.trim() ?? "",
      password: process.env.PLAYWRIGHT_VIEWER_PASSWORD?.trim() ?? "",
    },
  } satisfies Record<z.infer<typeof playwrightRoleSchema>, { email: string; password: string }>;

  const credentials = credentialsByRole[role];
  return credentials.email && credentials.password ? credentials : null;
};

const isPlaywrightAuthRouteEnabled = () =>
  Boolean(
    (process.env.NODE_ENV !== "production" || process.env.BASEBUDDY_TEST_BUILD === "1") &&
    process.env.BASEBUDDY_ENABLE_TEST_AUTH === "1" &&
      process.env.BASEBUDDY_PLAYWRIGHT_RUNTIME === "1" &&
      process.env.PLAYWRIGHT_BASE_URL?.trim() &&
      process.env.PLAYWRIGHT_OWNER_EMAIL?.trim() &&
      process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim(),
  );

export async function GET(request: NextRequest) {
  if (!isPlaywrightAuthRouteEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsedRole = playwrightRoleSchema.safeParse(request.nextUrl.searchParams.get("role"));

  if (!parsedRole.success) {
    return NextResponse.json({ error: "Select a valid Playwright role." }, { status: 400 });
  }

  const credentials = getPlaywrightRoleCredentials(parsedRole.data);

  if (!credentials) {
    return NextResponse.json({ error: "Playwright role credentials are not configured." }, { status: 500 });
  }

  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const user = await authenticateBaseBuddyConfigUser(credentials);

  if (!user) {
    return NextResponse.json({ error: "Could not sign in Playwright role." }, { status: 500 });
  }

  await createLocalAuthenticatedSession({
    cookies: response.cookies,
    request,
    userId: user.id,
  });

  return response;
}
