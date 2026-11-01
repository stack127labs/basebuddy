import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

globalThis.React = React;

const { refreshMock, replaceMock, toastErrorMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  replaceMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const MockNextLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<"a">>(
  ({ children, href, ...props }, ref) => (
    <a ref={ref} href={href} {...props}>
      {children}
    </a>
  ),
);
MockNextLink.displayName = "MockNextLink";

vi.mock("next/link", () => ({
  default: MockNextLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    replace: replaceMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

describe("account menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("logs out through the local auth API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { AccountMenu } = await import("@/components/account/account-menu");

    render(<AccountMenu avatarUrl={null} email="owner@example.com" name="Owner User" />);

    fireEvent.pointerDown(screen.getByRole("button", { name: /open account menu/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /log out/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
      });
      expect(replaceMock).toHaveBeenCalledWith("/login");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("uses docs and support links from the server-provided branding", async () => {
    const { AccountMenu } = await import("@/components/account/account-menu");
    const { BrandingProvider } = await import("@/components/branding-provider");

    render(
      <BrandingProvider
        branding={{
          appName: "Studio CMS",
          docsUrl: "https://docs.example.com",
          supportUrl: "https://support.example.com",
        }}
      >
        <AccountMenu avatarUrl={null} email="owner@example.com" name="Owner User" />
      </BrandingProvider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /open account menu/i }), {
      button: 0,
      ctrlKey: false,
    });

    const links = (await screen.findAllByRole("menuitem")).map((item) => item.closest("a")?.getAttribute("href") ?? item.getAttribute("href"));
    expect(links).toContain("https://docs.example.com");
    expect(links).toContain("https://support.example.com");
  });
});
