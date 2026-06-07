import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingBag, Package, Bell } from "lucide-react";

function Tab({
  to, label, icon: Icon, exact,
}: { to: string; label: string; icon: any; exact?: boolean }) {
  return (
    <Link
      to={to as any}
      activeOptions={{ exact }}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground data-[status=active]:text-primary"
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function AdminBottomTabBar({ role }: { role: "admin" | "staff" }) {
  return (
    <>
      <div className="h-16" aria-hidden />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto flex items-stretch">
          <Tab to="/admin" label="סקירה" icon={LayoutDashboard} exact />
          <Tab to="/admin/orders" label="הזמנות" icon={ShoppingBag} />
          {role === "admin" ? (
            <Tab to="/admin/products" label="מוצרים" icon={Package} />
          ) : (
            <Tab to="/admin/stock" label="מלאי" icon={Package} />
          )}
          <Tab to="/admin/notifications" label="התראות" icon={Bell } />
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </>
  );
}
