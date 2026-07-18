import { FilePlus2, LayoutDashboard, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/auth/token";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL_ROLES: Role[] = ["CONTRACTOR", "RELATIONSHIP_MANAGER", "RISK_OFFICER", "ADMIN"];

// The dashboard is the single hub for both roles: contractors see their cases,
// officers see the review queue. Case and review flows are reached from there.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
  { href: "/cases/new", label: "New Case", icon: FilePlus2, roles: ["CONTRACTOR"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
