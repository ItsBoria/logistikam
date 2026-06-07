import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { useAdminRoles } from "@/hooks/use-admin-roles";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setTeamSession } from "@/lib/team-session";
import { AdminBottomTabBar } from "@/components/admin-bottom-tab-bar";
import {
  LogOut, Package, Users, ShoppingBag, UserCog, Loader2,
  LayoutDashboard, Replace, Boxes, Bell,
} from "lucide-react";


type NavItem = {
  to: string;
  label: string;
  icon: any;
  exact?: boolean;
};

const NAV_ADMIN: NavItem[] = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/products", label: "מוצרים", icon: Package },
  { to: "/admin/replacements", label: "החלפות", icon: Replace },
  { to: "/admin/replacement-inventory", label: "מלאי החלפות", icon: Boxes },
  { to: "/admin/teams", label: "צוותים", icon: Users },
  { to: "/admin/users", label: "מנהלים", icon: UserCog },
  { to: "/admin/notifications", label: "התראות", icon: Bell },
];

const NAV_STAFF: NavItem[] = [
  { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { to: "/admin/stock", label: "מלאי", icon: Package },
  { to: "/admin/notifications", label: "התראות", icon: Bell },
];

export function AdminShell({
  children,
  /** If true (default), the route is admin-only. Staff users will be redirected. */
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const navigate = useNavigate();
  const { session, loading } = useSupabaseSession();
  const { data: roles, loading: rolesLoading } = useAdminRoles();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (session) setTeamSession(null);
  }, [session]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && !rolesLoading && roles && !roles.hasAccess) {
      supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    }
  }, [session, rolesLoading, roles, navigate]);

  // Staff trying to access admin-only route → redirect to allowed area
  useEffect(() => {
    if (!session || rolesLoading || !roles) return;
    if (adminOnly && !roles.isAdmin && roles.isStaff) {
      navigate({ to: "/admin/orders", replace: true });
    }
  }, [adminOnly, session, rolesLoading, roles, navigate]);

  if (loading || !session || rolesLoading || !roles || !roles.hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (adminOnly && !roles.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h2 className="text-lg font-bold mb-2">אין הרשאה</h2>
          <p className="text-sm text-muted-foreground">דף זה זמין רק למנהלים.</p>
        </div>
      </div>
    );
  }

  const visibleNav = roles.isAdmin ? NAV_ADMIN : NAV_STAFF;

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="bg-card border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="font-bold text-lg">
              {roles.isAdmin ? "פאנל ניהול" : "פאנל מחסן"}
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {visibleNav.map((n) => {
                const active = n.exact ? path === n.to : path.startsWith(n.to) && n.to !== "/admin";
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                  >
                    <n.icon className="w-4 h-4" /> {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{session.user.email}</span>
            {!roles.isAdmin && roles.isStaff && (
              <span className="text-xs px-2 py-0.5 rounded bg-primary/15 text-primary hidden sm:inline">צוות מחסן</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}
            >
              <LogOut className="w-4 h-4 ml-2" /> יציאה
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 px-2 pb-2 overflow-x-auto">
          {visibleNav.map((n) => {
            const active = n.exact ? path === n.to : path.startsWith(n.to) && n.to !== "/admin";
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto p-4 pb-20">{children}</main>
      <AdminBottomTabBar role={roles.isAdmin ? "admin" : "staff"} />
    </div>
  );
}
