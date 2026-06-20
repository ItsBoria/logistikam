import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MoreHorizontal, Replace, LogOut, ShoppingCart } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setTeamSession } from "@/lib/team-session";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PushToggle } from "@/components/push-toggle";
import { InstallButton } from "@/components/install-button";
import { useCart } from "@/lib/cart-context";
import { getShopData } from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";

type Item = { to: string; label: string; icon: any; exact?: boolean };
type PillTone = "normal" | "warning" | "error";

const SHOP_ITEMS: Item[] = [
  { to: "/shop", label: "חנות", icon: Home, exact: true },
  { to: "/shop/replacements", label: "החלפות", icon: Replace },
  { to: "/shop/orders", label: "הזמנות", icon: ClipboardList },
];

function formatPillCurrency(amount: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function useIsActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
}

function PillBase({
  active, onClick, to, ariaLabel, children, tone = "normal",
}: {
  active: boolean;
  onClick?: () => void;
  to?: string;
  ariaLabel: string;
  children: React.ReactNode;
  tone?: PillTone;
}) {
  const appearance = tone === "error"
    ? "bg-destructive/10 text-destructive ring-1 ring-destructive/35"
    : tone === "warning"
      ? "bg-warning/20 text-warning-foreground ring-1 ring-warning/30"
      : active
        ? "bg-primary text-primary-foreground shadow-sm sm:px-3.5"
        : "text-muted-foreground hover:text-foreground hover:bg-muted";
  const cls = [
    "group relative flex items-center justify-center gap-1.5 sm:gap-2 rounded-full transition-all",
    "h-11 px-2 min-w-10 sm:px-3 sm:min-w-11",
    appearance,
  ].join(" ");
  if (to) return <Link to={to as any} className={cls} aria-label={ariaLabel}>{children}</Link>;
  return <button onClick={onClick} className={cls} aria-label={ariaLabel} type="button">{children}</button>;
}

function StorePill({ active }: { active: boolean }) {
  return (
    <PillBase active={active} to="/shop" ariaLabel="חנות">
      <Home className="w-5 h-5 shrink-0" />
      <span className="hidden text-xs font-medium whitespace-nowrap sm:inline">חנות</span>
    </PillBase>
  );
}

function CartPill({ pin }: { pin: string }) {
  const queryClient = useQueryClient();
  const { itemCount, cart, openCheckout, bumpKey } = useCart();
  const fetchShop = useServerFn(getShopData);
  const { data } = useQuery({
    queryKey: ["shop", pin],
    queryFn: () => fetchShop({ data: { pin } }),
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });

  const teamId = data?.team.id;
  useEffect(() => {
    if (!teamId) return;
    const refreshBudget = () => {
      void queryClient.invalidateQueries({ queryKey: ["shop", pin] });
    };
    const channel = supabase
      .channel(`shop-budget-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `id=eq.${teamId}` }, refreshBudget)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `team_id=eq.${teamId}` }, refreshBudget)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pin, queryClient, teamId]);

  const products = data?.products ?? [];
  const cartTotal = products.reduce((sum: number, product: any) =>
    sum + Number(product.price) * (cart[product.id] || 0), 0);
  const totalBudget = Number(data?.team.monthly_limit ?? 0);
  const previouslyUsed = Number(data?.spent ?? 0);
  const hasBudget = totalBudget > 0;
  const remainingRaw = hasBudget ? totalBudget - previouslyUsed - cartTotal : 0;
  const exceededBy = hasBudget ? Math.max(0, -remainingRaw) : 0;
  const remaining = hasBudget ? Math.max(0, remainingRaw) : 0;
  const isOverBudget = exceededBy > 0;
  const isLowBudget = hasBudget && !isOverBudget && remaining / totalBudget < 0.2;
  const tone: PillTone = isOverBudget ? "error" : isLowBudget ? "warning" : "normal";
  const hasCart = itemCount > 0;

  const ariaLabel = hasBudget
    ? isOverBudget
      ? `סל: ${itemCount} פריטים, ${formatPillCurrency(cartTotal)}. חריגה מהתקציב בסך ${formatPillCurrency(exceededBy)}, מתוך תקציב כולל של ${formatPillCurrency(totalBudget)}`
      : `סל: ${itemCount} פריטים, ${formatPillCurrency(cartTotal)}. נותרו ${formatPillCurrency(remaining)} מתוך ${formatPillCurrency(totalBudget)}`
    : `סל: ${itemCount} פריטים, ${formatPillCurrency(cartTotal)}. ללא מסגרת תקציב`;

  return (
    <PillBase active={hasCart} tone={tone} onClick={openCheckout} ariaLabel={ariaLabel}>
      <span key={bumpKey} className="relative inline-flex animate-in zoom-in-95 duration-200">
        <ShoppingCart className="h-[18px] w-[18px] shrink-0 sm:h-5 sm:w-5" />
      </span>
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="hidden text-xs font-medium tabular-nums whitespace-nowrap sm:inline">
          {itemCount} פריטים · {formatPillCurrency(cartTotal)}
        </span>
        <span className="text-[11px] font-medium tabular-nums whitespace-nowrap sm:hidden">
          סל · {itemCount} · {formatPillCurrency(cartTotal)}
        </span>
        {hasBudget ? (
          <span className={[
            "text-[9px] sm:text-[10px] tabular-nums whitespace-nowrap",
            tone === "normal" && hasCart ? "text-primary-foreground/80" : "opacity-80",
          ].join(" ")}>
            {isOverBudget ? (
              <>
                <span className="hidden sm:inline">חריגה של {formatPillCurrency(exceededBy)} מתוך {formatPillCurrency(totalBudget)}</span>
                <span className="sm:hidden">חריגה {formatPillCurrency(exceededBy)} · {formatPillCurrency(totalBudget)}</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">נותרו {formatPillCurrency(remaining)} מתוך {formatPillCurrency(totalBudget)}</span>
                <span className="sm:hidden">{formatPillCurrency(remaining)} / {formatPillCurrency(totalBudget)}</span>
              </>
            )}
          </span>
        ) : (
          <span className={[
            "text-[9px] sm:text-[10px] whitespace-nowrap",
            hasCart ? "text-primary-foreground/80" : "text-muted-foreground",
          ].join(" ")}>
            ללא מסגרת תקציב
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
      <span className={["text-xs font-medium whitespace-nowrap", active ? "hidden sm:inline" : "hidden md:group-hover:inline"].join(" ")}>
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
      <div className="fixed bottom-0 inset-x-0 z-40 pb-[max(env(safe-area-inset-bottom),16px)] px-3 sm:px-4 pointer-events-none">
        <nav
          className={[
            "pointer-events-auto mx-auto w-fit max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2rem)]",
            "flex items-center gap-1 p-1.5 rounded-full",
            "bg-card/90 backdrop-blur-xl border shadow-lg",
          ].join(" ")}
        >
          {pin ? <StorePill active={isActive("/shop", true)} /> : <Tab item={SHOP_ITEMS[0]} active={isActive("/shop", true)} />}
          {pin && <CartPill pin={pin} />}
          <Tab item={SHOP_ITEMS[1]} active={isActive("/shop/replacements")} />
          <Tab item={SHOP_ITEMS[2]} active={isActive("/shop/orders")} />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="group flex h-11 min-w-10 items-center justify-center gap-2 rounded-full px-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:min-w-11 sm:px-3"
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
