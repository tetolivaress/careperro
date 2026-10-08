import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware drop-ins for next/link and next/navigation. Always use these inside the app. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
