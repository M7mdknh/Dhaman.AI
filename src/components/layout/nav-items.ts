import { LayoutDashboard, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/auth/token";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL_ROLES: Role[] = ["CONTRACTOR", "RISK_OFFICER", "ADMIN"];

// The dashboard is the single hub for both roles: contractors see their cases,
// officers see the review queue. Case and review flows are reached from there.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
