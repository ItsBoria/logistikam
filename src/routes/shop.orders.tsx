import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardList, Loader2, Phone, User, RotateCcw } from "lucide-react";
import { getTeamOrders, repeatOrder } from "@/lib/team.functions";
import { getTeamSession } from "@/lib/team-session";
import { formatCurrency, VAT_LABEL } from "@/lib/pricing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { BottomTabBar } from "@/components/bottom-tab-bar";

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתינה",
  awaiting_approval: "ממתינה לאישור מנהל",
  approved: "אושרה",
  preparing: "בהכנה",
  ready: "מוכנה לאיסוף",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  awaiting_approval: "bg-warning text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  preparing: "bg-primary/15 text-primary",
  ready: "bg-success text-success-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

export const Route = createFileRoute("/shop/orders")({
  ssr: false,
  head: () => ({ meta: [{ title: "ההזמנות שלי" }] }),
  notFoundComponent: OrdersNotFound,
  errorComponent: OrdersError,
  component: OrdersPage,
});

function OrdersNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">לא הצלחנו לפתוח את היסטוריית ההזמנות.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild variant="outline"><Link to="/shop">חזרה לחנות</Link></Button>
          <Button asChild><Link to="/shop/orders">נסה שוב</Link></Button>
        </div>
      </Card>
    </div>
  );
}

function OrdersError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <p className="font-semibold">יש בעיה בטעינת ההזמנות</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => { router.invalidate(); reset(); }}>נסה שוב</Button>
          <Button asChild><Link to="/shop">חזרה לחנות</Link></Button>
        </div>
      </Card>
    </div>
  );
}

function OrdersPage() {
  const navigate = useNavigate();
  const session = typeof window !== "undefined" ? getTeamSession() : null;
  const fetchOrders = useServerFn(getTeamOrders);
  const reorderFn = useServerFn(repeatOrder);

  useEffect(() => {
    if (!session?.pin) {
      navigate({ to: "/", replace: true });
    }
  }, [navigate, session?.pin]);

  const { data, isLoading } = useQuery({
    enabled: !!session?.pin,
    queryKey: ["team-orders", session?.pin],
    queryFn: () => fetchOrders({ data: { pin: session!.pin } }),
    staleTime: 30_000,
  });

  async function handleReorder(orderId: string) {
    if (!session?.pin) return;
    try {
      const res = await reorderFn({ data: { pin: session.pin, order_id: orderId } });
      if (!res.items.length) {
        toast.error("אף אחד מהפריטים אינו זמין כעת");
        return;
      }
      sessionStorage.setItem(`prefill-cart:${session.pin}`, JSON.stringify(res.items));
      if (res.skipped.length) {
        toast.warning(`חלק מהפריטים לא נוספו: ${res.skipped.join(", ")}`);
      } else {
        toast.success("הפריטים הועברו לסל");
      }
      navigate({ to: "/shop" });
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    }
  }


  if (!session?.pin || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <p className="text-sm text-muted-foreground">לא נמצאו נתוני הזמנות כרגע.</p>
          <div className="mt-4 flex justify-center">
            <Button asChild><Link to="/shop">חזרה לחנות</Link></Button>
          </div>
        </Card>
      </div>
    );
  }

  const orders = data.orders ?? [];

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">ההזמנות שלי</h1>
            <p className="text-xs text-muted-foreground">{data.team.name}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/shop"><ArrowRight className="ml-2 h-4 w-4" />חזרה לחנות</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <span className="font-medium">{orders.length} הזמנות</span>
            </div>
            <span className="text-xs text-muted-foreground">כל המחירים {VAT_LABEL}</span>
          </div>
        </Card>

        {!orders.length ? (
          <Card className="p-10 text-center text-muted-foreground">עוד לא ביצעת הזמנות</Card>
        ) : (
          <Accordion type="multiple" className="space-y-3">
            {orders.map((order: any) => {
              const itemCount = (order.order_items as any[]).reduce((sum, item) => sum + Number(item.quantity), 0);
              return (
                <AccordionItem key={order.id} value={order.id} className="overflow-hidden rounded-lg border bg-card px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex w-full flex-col gap-3 text-right sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? STATUS_COLOR.pending}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                          <span className="text-sm font-semibold">#{order.id.slice(0, 8)}</span>
                          <span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("he-IL")}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{order.ordered_by_name || "ללא שם"}</span>
                          {order.contact_phone ? <span className="flex items-center gap-1" dir="ltr"><Phone className="h-3 w-3" />{order.contact_phone}</span> : null}
                          <span>{itemCount} פריטים</span>
                        </div>
                      </div>
                      <div className="text-lg font-bold">{formatCurrency(Number(order.total))}</div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pb-4">
                      <div className="overflow-hidden rounded-md border">
                        {(order.order_items as any[]).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(Number(item.price))} × {item.quantity}</div>
                            </div>
                            <div className="font-semibold">{formatCurrency(Number(item.price) * Number(item.quantity))}</div>
                          </div>
                        ))}
                      </div>
                      {order.notes ? <div className="rounded-md bg-muted p-3 text-sm">הערות: {order.notes}</div> : null}
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleReorder(order.id)}>
                          <RotateCcw className="ml-2 h-4 w-4" /> הזמן שוב
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </main>
      <BottomTabBar />
    </div>
  );
}