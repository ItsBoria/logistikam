import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MoreHorizontal, Replace, LogOut, ShoppingCart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setTeamSession } from "@/lib/team-session";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PushToggle } from "@/components/push-toggle";
import { InstallButton } from "@/components/install-button";
import { useCart } from "@/lib/cart-context";
import { getShopData } from "@/lib/team.functions";
import { formatCurrency, formatCurrencyShort } from "@/lib/pricing";

type Item = { to: string; label: string; icon: any; exact?: boolean };

const SHOP_ITEMS: Item[] = [
  { to: "/shop", label: "חנות", icon: Home, exact: true },
  { to: "/shop/replacements", label: "החלפות", icon: Replace },
  { to: "/shop/orders", label: "הזמנות", icon: ClipboardList },
];

function useIsActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
}

function PillBase({
  active, onClick, to, ariaLabel, children,
}: {
  active: boolean;
  onClick?: () => void;
  to?: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const cls = [
    "group relative flex items-center justify-center gap-2 rounded-full transition-all",
    "h-11 px-3 min-w-11",
    active
      ? "bg-primary text-primary-foreground shadow-sm px-3.5"
      : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
  if (to) return <Link to={to as any} className={cls} aria-label={ariaLabel}>{children}</Link>;
  return <button onClick={onClick} className={cls} aria-label={ariaLabel} type="button">{children}</button>;
}

function StorePill({ active, pin }: { active: boolean; pin: string }) {
  const fetchShop = useServerFn(getShopData);
  const { data } = useQuery({
    queryKey: ["shop", pin],
    queryFn: () => fetchShop({ data: { pin } }),
    staleTime: 30_000,
  });
  const { cart } = useCart();
  const products = data?.products ?? [];
  const cartTotal = products.reduce((s: number, p: any) => s + Number(p.price) * (cart[p.id] || 0), 0);
  const limit = Number(data?.team.monthly_limit ?? 0);
  const spent = Number(data?.spent ?? 0);
  const remaining = limit > 0 ? Math.max(0, limit - spent - cartTotal) : null;
  const willExceed = limit > 0 && spent + cartTotal > limit;

  return (
    <PillBase active={active} to="/shop" ariaLabel="חנות">
      <Home className="w-5 h-5 shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium whitespace-nowrap">חנות</span>
        {remaining !== null && (active || true) && (
          <span className={[
            "text-[10px] tabular-nums whitespace-nowrap",
            active ? "text-primary-foreground/80" : willExceed ? "text-destructive" : "text-muted-foreground",
          ].join(" ")}>
            <span className="hidden sm:inline">{willExceed ? "חורג" : `נותר ${formatCurrency(remaining)}`}</span>
            <span className="sm:hidden">{willExceed ? "חורג" : formatCurrencyShort(remaining)}</span>
          </span>
        )}
      </span>
    </PillBase>
  );
}

function CartPill({ pin }: { pin: string }) {
  const { itemCount, cart, openCheckout, bumpKey } = useCart();
  const fetchShop = useServerFn(getShopData);
  const { data } = useQuery({
    queryKey: ["shop", pin],
    queryFn: () => fetchShop({ data: { pin } }),
    staleTime: 30_000,
  });
  const products = data?.products ?? [];
  const total = products.reduce((s: number, p: any) => s + Number(p.price) * (cart[p.id] || 0), 0);
  const has = itemCount > 0;

  return (
    <PillBase active={has} onClick={openCheckout} ariaLabel="סל">
      <span key={bumpKey} className="relative inline-flex animate-in zoom-in-95 duration-200">
        <ShoppingCart className="w-5 h-5 shrink-0" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-medium whitespace-nowrap">
          סל{has ? ` · ${itemCount}` : ""}
        </span>
        {has && (
          <span className="text-[10px] tabular-nums whitespace-nowrap text-primary-foreground/80">
            <span className="hidden sm:inline">{formatCurrency(total)}</span>
            <span className="sm:hidden">{formatCurrencyShort(total)}</span>
          </span>
        )}
      </span>
    </PillBase>
  );
}

function Tab({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <PillBase active={active} to={item.to} ariaLabel={item.label}>
      <Icon className="w-5 h-5 shrink-0" />
      <span className={["text-xs font-medium whitespace-nowrap", active ? "inline" : "hidden md:group-hover:inline"].join(" ")}>
        {item.label}
      </span>
    </PillBase>
  );
}

export function BottomTabBar({ pin }: { pin?: string }) {
  const navigate = useNavigate();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  function logout() {
    setTeamSession(null);
    setOpen(false);
    navigate({ to: "/" });
  }

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
          {pin ? <StorePill active={isActive("/shop", true)} pin={pin} /> : <Tab item={SHOP_ITEMS[0]} active={isActive("/shop", true)} />}
          {pin && <CartPill pin={pin} />}
          <Tab item={SHOP_ITEMS[1]} active={isActive("/shop/replacements")} />
          <Tab item={SHOP_ITEMS[2]} active={isActive("/shop/orders")} />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="group flex items-center justify-center gap-2 rounded-full transition-all h-11 px-3 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="עוד"
                type="button"
              >
                <MoreHorizontal className="w-5 h-5 shrink-0" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader><SheetTitle>עוד</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2">
                <InstallButton />
                {pin && (
                  <div className="[&>button]:w-full [&>button]:justify-start [&>button]:h-12">
                    <PushToggle pin={pin} />
                  </div>
                )}
                <Button variant="outline" className="w-full justify-start h-12" onClick={logout}>
                  <LogOut className="w-4 h-4 ml-2" /> יציאה
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </>
  );
}
