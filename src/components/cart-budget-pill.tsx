import { formatCurrency } from "@/lib/pricing";
import { ShoppingCart, AlertTriangle } from "lucide-react";

type Props = {
  itemCount: number;
  total: number;
  spent: number;
  limit: number;
  willExceed: boolean;
  onOpen: () => void;
};

export function CartBudgetPill({ itemCount, total, spent, limit, willExceed, onOpen }: Props) {
  const hasLimit = limit > 0;
  const projected = spent + total;
  const used = hasLimit ? Math.min(1, projected / limit) : 0;
  const remaining = hasLimit ? Math.max(0, limit - projected) : 0;

  const size = 38;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * used;

  const ringColor = willExceed
    ? "stroke-destructive"
    : used > 0.8
    ? "stroke-warning"
    : "stroke-primary";

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 pointer-events-none"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={itemCount === 0 && !hasLimit}
        className={[
          "pointer-events-auto mx-auto flex items-center gap-3 w-fit max-w-[calc(100vw-2rem)]",
          "rounded-full pl-2 pr-4 py-1.5 transition-all",
          "bg-card/95 backdrop-blur-xl border shadow-lg",
          itemCount > 0 ? "hover:scale-[1.02] active:scale-[0.98]" : "opacity-95",
        ].join(" ")}
        aria-label="פתח סל"
      >
        {hasLimit ? (
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted fill-none" strokeWidth={stroke} />
              <circle
                cx={size / 2} cy={size / 2} r={r}
                className={`${ringColor} fill-none transition-all`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${c}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {willExceed ? (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              ) : (
                <ShoppingCart className="w-4 h-4 text-foreground" />
              )}
            </div>
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground flex items-center justify-center">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </div>
        ) : (
          <div className="relative shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-primary" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground flex items-center justify-center">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </div>
        )}

        <div className="text-right leading-tight">
          <div className="font-semibold text-sm tabular-nums">{formatCurrency(total)}</div>
          {hasLimit ? (
            <div className={`text-[10px] tabular-nums ${willExceed ? "text-destructive" : "text-muted-foreground"}`}>
              <span>{formatCurrency(projected)}</span>
              <span className="opacity-60"> / {formatCurrency(limit)}</span>
              <span className="mx-1">·</span>
              {willExceed ? "חורג" : `נותר ${formatCurrency(remaining)}`}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              {itemCount > 0 ? `${itemCount} פריטים בסל` : "הסל ריק"}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
