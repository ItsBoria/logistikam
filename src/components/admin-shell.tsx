import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setTeamSession } from "@/lib/team-session";
import { LogOut, Package, Users, ShoppingBag, UserCog, Loader2, LayoutDashboard } from "lucide-react";

export function AdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { session, loading } = useSupabaseSession();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Ensure no leftover team session while in admin mode
  useEffect(() => { if (session) setTeamSession(null); }, [session]);

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    enabled: !!session,
    queryKey: ["is-admin", session?.user.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("id").eq("user_id", session!.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/admin/login", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && !roleLoading && isAdmin === false) {
      supabase.auth.signOut();
      navigate({ to: "/admin/login", replace: true });
    }
  }, [session, roleLoading, isAdmin, navigate]);

  if (loading || !session || roleLoading || !isAdmin) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const nav = [
    { to: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
    { to: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
    { to: "/admin/products", label: "מוצרים", icon: Package },
    { to: "/admin/teams", label: "צוותים", icon: Users },
    { to: "/admin/users", label: "מנהלים", icon: UserCog },
  ];

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="bg-card border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/admin/orders" className="font-bold text-lg">פאנל ניהול</Link>
            <nav className="hidden md:flex items-center gap-1">
              {nav.map(n => {
                const active = path.startsWith(n.to);
                return (
                  <Link key={n.to} to={n.to}
                    className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                    <n.icon className="w-4 h-4" /> {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{session.user.email}</span>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/admin/login" }))}>
              <LogOut className="w-4 h-4 ml-2" /> יציאה
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 px-2 pb-2 overflow-x-auto">
          {nav.map(n => {
            const active = path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto p-4">{children}</main>
    </div>
  );
}
