## 1. Inline budget & cart inside the navigation pills

**Remove** the floating `CartBudgetPill` (`src/components/cart-budget-pill.tsx`) from `src/routes/shop.index.tsx`. Delete its usage entirely — no floating cart/budget element remains.

**Cart context** — new `src/lib/cart-context.tsx`:
- React context holding `cart: Record<string, number>` + `setCart` persisted to `sessionStorage` (per-PIN key `cart:<pin>`).
- Exposes `useCart()` returning `{ cart, setQty, clear, itemCount, total, products }`.
- Wraps shop routes (provider mounted in `src/routes/shop.route.tsx` if exists, otherwise inside `__root.tsx` gated by pathname starting with `/shop`).
- Shop page uses `useCart()` instead of local `useState<CartMap>` so the cart survives tab switches and feeds the nav pill.
- Also exposes `useShopBudget()` reading the same `getShopData` query (shared queryKey `["shop", pin]`) so the pill and the shop screen share cache — no extra fetch.

**`src/components/bottom-tab-bar.tsx`** — extend the `Tab` rendering for `/shop` (store) and add a new Cart pill:
- Store pill: under the label show `נותר ₪2,450` (mobile shortens to `₪2.4K` via a `formatShort` helper). Smaller text (`text-[10px] opacity-80`), no badge.
- Cart pill (new entry replacing nothing — added between Store and Replacements): icon `ShoppingCart`, label `סל`, subtitle `3 · ₪420` when non-empty, `0` when empty. Tapping opens checkout dialog (lift `setCheckout` via context event or navigate to `/shop?checkout=1`).
- Active state still highlights the route; pill grows only when active (label visible). Inactive pills on mobile keep just the icon + tiny count badge to avoid overflow.
- Two-line layout: icon on top row with label, secondary number on second line, using `flex-col` only when active or when value present; otherwise icon-only to keep bar compact.
- Use `tabular-nums`, `formatCurrency` from `@/lib/pricing`, new `formatCurrencyShort` helper for mobile (`< 640px`) via Tailwind `sm:` variants — render both spans and toggle visibility, no JS breakpoint.

**Budget reactivity**: after `placeOrder` success in shop page call `queryClient.invalidateQueries(["shop", pin])` (already partially done via `refetch`) — the pill reads same query so it updates automatically. Same when admin adjusts budget elsewhere (already invalidates).

## 2. Header & navigation cleanup

- Keep auto-hide-on-scroll header (already implemented).
- Remove duplicate "warning banner" budget info in header when the pill already shows projected/remaining; keep only the critical "חורג" badge.
- Ensure pill bar uses consistent sizing (`h-12`), shared `Tab` component for all variants.
- Add `framer-motion` `layout` prop on active pill so width animates smoothly when label appears.
- Remove `<div className="h-24" />` spacer duplication — keep single spacer at bottom equal to nav height + safe-area.

## 3. UX polish

- Add-to-cart feedback: in shop card, when `setQty` increases, trigger a tiny `motion.div` scale bump on the Cart pill (via context event emitter `cartBumpRef`).
- Disable "אישור ושליחת הזמנה" when `willExceed && !approvalAllowed` with tooltip "חריגה מהתקציב — דרוש אישור מנהל" (current flow already requires approval — keep submission allowed but show clearer copy).
- Show "נותר אחרי סל: ₪X" line inside the checkout dialog.
- Skeleton: replace the full-screen `Loader2` with a lightweight grid skeleton (6 placeholder cards) in shop while loading.
- Toasts already via `sonner` — keep concise.

## 4. PDF Hebrew/RTL fix

Current PDF uses `jsPDF` with `isInputRtl: true`. jsPDF's bidi support is unreliable for mixed Hebrew/digits and is the root cause of reversed output in the saved file. Switch the PDF path to **pdfmake** with the Heebo TTF and proper `rtl` paragraph property, OR use **pdf-lib + @pdf-lib/fontkit** with manual bidi via `bidi-js`.

Chosen approach: **pdfmake** (smallest change, supports `alignment: 'right'` and a doc-level `rtl: true` extension via `defaultStyle.alignment`).
- Add deps: `pdfmake`, `bidi-js` (for shaping if needed).
- New `src/lib/pdf-rtl.ts`: registers Heebo font with pdfmake VFS, exposes `createRtlPdf(docDef)`.
- Rewrite `downloadWeeklyPDF` in `src/lib/weekly-export.ts` to build a pdfmake `TableLayout` with columns in logical order and `layout: { defaultBorder: true }`, set `pageOrientation: 'landscape'`, every text node carries `alignment: 'right'`, `font: 'Heebo'`, and uses pdfmake's built-in bidi (handles Hebrew + Latin/digits correctly without manual reversal).
- Column visual RTL: pdfmake renders LTR by default; we reverse the day cells array so Sunday is on the right visually, while keeping label column at the far right via `[labelCell, ...daysReversed]` then `alignment: 'right'` on the table widths.
- All titles, mission text, notes, day headers, "גורמים משפיעים" rendered via pdfmake `text` nodes — no manual string reversal anywhere.
- DOCX already uses `bidirectional: true` + `rightToLeft: true` correctly — keep as is but verify Heebo/Arial Hebrew font; switch font to `David` or keep `Arial` (Word substitutes a Hebrew-capable face). No change required beyond confirming output.
- Verification: after build, open `/admin/calendar`, export PDF, inspect with `pdftotext` and `pdftoppm` rendering to confirm correct order.

## 5. Files

**New**
- `src/lib/cart-context.tsx`
- `src/lib/pdf-rtl.ts`
- `src/lib/format-currency-short.ts` (or extend `src/lib/pricing.ts`)
- `src/components/shop-skeleton.tsx`

**Edited**
- `src/components/bottom-tab-bar.tsx` — add Store-with-budget and Cart pills
- `src/routes/shop.index.tsx` — drop `CartBudgetPill`, consume `useCart`, wrap in provider (or do at route layout), checkout dialog tweaks
- `src/routes/__root.tsx` or new `src/routes/shop.route.tsx` — mount `CartProvider` for `/shop/*`
- `src/lib/weekly-export.ts` — rewrite PDF using pdfmake; keep DOCX
- `src/lib/pricing.ts` — add `formatCurrencyShort`
- `package.json` / `bun.lock` — add `pdfmake`

**Deleted**
- `src/components/cart-budget-pill.tsx`

## 6. Acceptance verification
- Manual: cart count + budget visible in pills; navigating to `/shop/orders` and back preserves cart; placing an order updates budget instantly.
- PDF: open exported file in a PDF viewer (and via `pdftoppm` in CI) — Hebrew reads right-to-left with correct word/punctuation/digit order.
- No floating cart/budget element exists in the DOM.
