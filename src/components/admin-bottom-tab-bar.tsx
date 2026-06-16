import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, ShoppingBag, Package, Boxes, Users,
  MoreHorizontal, Replace, Bell, UserCog,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getAdminDashboard } from "@/lib/admin-dashboard.functions";

type Item = { to: string; label: string; icon: any; exact?: boolean };

const ADMIN_MAIN: Item[] = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/products", label: "מוצרים", icon: Package },
  { to: "/admin/users", label: "מנהלים", icon: UserCog },
  { to: "/admin/teams", label: "צוותים", icon: Users },
];

const ADMIN_MORE: Item[] = [
  { to: "/admin/replacement-inventory", label: "מלאי החלפות", icon: Boxes },
  { to: "/admin/replacements", label: "בקשות החלפה", icon: Replace },
  { to: "/admin/notifications", label: "התראות", icon: Bell },
];

const STAFF_MAIN: Item[] = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/stock", label: "מלאי", icon: Package },
  { to: "/admin/notifications", label: "התראות", icon: Bell },
];

function useIsActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
}

function Tab({ item, active, badge }: { item: Item; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to as any}
      className={[
        "group relative flex items-center justify-center gap-2 rounded-full transition-all",
        "h-11 px-3 min-w-11",
        active
          ? "bg-primary text-primary-foreground shadow-sm px-4"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      ].join(" ")}
      aria-label={item.label}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span
        className={[
          "text-xs font-medium whitespace-nowrap",
          active ? "inline" : "hidden md:group-hover:inline",
        ].join(" ")}
      >
        {item.label}
      </span>
      {badge && badge > 0 ? (
        <span
          className={[
            "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
            "flex items-center justify-center",
            active ? "bg-primary-foreground text-primary" : "bg-destructive text-destructive-foreground",
          ].join(" ")}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminBottomTabBar({ role }: { role: "admin" | "staff" }) {
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = role === "admin";

  const dashFn = useServerFn(getAdminDashboard);
  const { data: dash } = useQuery({
    queryKey: ["admin-dashboard-badge"],
    queryFn: () => dashFn(),
    enabled: isAdmin,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const pendingBadge =
    (dash?.kpis?.pending ?? 0) + (dash?.kpis?.awaiting ?? 0);

  const mainItems = isAdmin ? ADMIN_MAIN : STAFF_MAIN;
  const moreActive = isAdmin && ADMIN_MORE.some((i) => isActive(i.to, i.exact));

  return (
    <>
      <div className="h-24" aria-hidden />
      <div className="fixed bottom-0 inset-x-0 z-40 pb-[max(env(safe-area-inset-bottom),16px)] px-4 pointer-events-none">
        <nav
          className={[
            "pointer-events-auto mx-auto w-fit max-w-[calc(100vw-2rem)]",
            "flex items-center gap-1 p-1.5 rounded-full",
            "bg-card/90 backdrop-blur-xl border shadow-lg",
          ].join(" ")}
        >
          {mainItems.map((item) => (
            <Tab
              key={item.to}
              item={item}
              active={isActive(item.to, item.exact)}
              badge={item.to === "/admin/orders" && isAdmin ? pendingBadge : undefined}
            />
          ))}

          {isAdmin && (
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  className={[
                    "group flex items-center justify-center gap-2 rounded-full transition-all h-11 px-3 min-w-11",
                    moreActive
                      ? "bg-primary text-primary-foreground shadow-sm px-4"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  ].join(" ")}
                  aria-label="עוד"
                >
                  <MoreHorizontal className="w-5 h-5 shrink-0" />
                  <span
                    className={[
                      "text-xs font-medium whitespace-nowrap",
                      moreActive ? "inline" : "hidden md:group-hover:inline",
                    ].join(" ")}
                  >
                    עוד
                  </span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>עוד</SheetTitle>
                </SheetHeader>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {ADMIN_MORE.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.to, item.exact);
                    return (
                      <Link
                        key={item.to}
                        to={item.to as any}
                        onClick={() => setMoreOpen(false)}
                        className={[
                          "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border",
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
                        ].join(" ")}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-xs font-medium text-center">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </nav>
      </div>
    </>
  );
}
