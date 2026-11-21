import { Boxes, LayoutDashboard, Package, ShoppingBag } from "lucide-react";

export const navigationItems = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "A clear starting point for your workspace.",
  },
  {
    label: "Products",
    href: "/products",
    icon: Package,
    description: "A considered home for your product catalogue.",
  },
  {
    label: "Orders",
    href: "/orders",
    icon: ShoppingBag,
    description: "Keep every order and its progress in view.",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Boxes,
    description: "Stay close to stock and its movements.",
  },
] as const;

export function isNavigationActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const root = { label: "Workspace", href: "/dashboard" };
  if (pathname === "/orders/new")
    return [root, { label: "Orders", href: "/orders" }, { label: "New order" }];
  if (pathname.startsWith("/orders/"))
    return [root, { label: "Orders", href: "/orders" }, { label: "Order details" }];
  return [
    root,
    { label: navigationItems.find((item) => item.href === pathname)?.label ?? "Overview" },
  ];
}
