"use client";

import React, { createContext, useContext, type ReactNode } from "react";

import { defaultBaseBuddyBranding, type BaseBuddyBranding } from "@/lib/branding";

const BrandingContext = createContext<BaseBuddyBranding>(defaultBaseBuddyBranding);

export function BrandingProvider({ branding, children }: { branding: BaseBuddyBranding; children: ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export const useBaseBuddyBranding = () => useContext(BrandingContext);
