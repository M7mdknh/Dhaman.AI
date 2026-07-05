import { LayoutDashboard, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/auth/token";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL_ROLES: Role[] = ["CONTRACTOR", "RISK_OFFICER", "ADMIN"];

// Grows sprint by sprint (Cases → Sprint 3, Review queue → Sprint 7, …).
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
