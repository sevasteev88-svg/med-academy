"use client";

import { usePathname } from "next/navigation";

const STANDALONE_EXACT_PATHS = new Set(["/login", "/register", "/demo"]);
const STANDALONE_PREFIX_PATHS = [
  "/rehab-portal",
  "/parent/",
  "/consent/",
  "/tg-coach",
];

export function isStandalonePortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (STANDALONE_EXACT_PATHS.has(pathname)) return true;
  return STANDALONE_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export default function LayoutMain({
  hasStaffNav,
  children,
}: {
  hasStaffNav: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const applyStaffOffset = hasStaffNav && !isStandalonePortalPath(pathname);

  return (
    <main
      className={`${
        applyStaffOffset ? "md:ml-16 pt-14 md:pt-0 pb-24 md:pb-6" : ""
      } flex-1 min-w-0 overflow-x-hidden`}
    >
      {children}
    </main>
  );
}
