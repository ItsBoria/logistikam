## Fixes

### 1. Floating cart bar collides with bottom nav
- In `shop.index.tsx` and `shop.replacements.tsx`, raise the cart bar above the nav: `z-50` (nav stays `z-40`) and position it at `bottom-[calc(4rem+env(safe-area-inset-bottom))]` so it always sits flush above the tabs on devices with a home indicator.

### 2. Move Push toggle + Add to Home Screen into "עוד" sheet
- Update `BottomTabBar` to take a `pin` prop.
- Inside the "עוד" sheet render, in order:
  1. `<InstallButton />` — new component
  2. `<PushToggle pin={pin} />`
  3. Existing "יציאה" button.
- Pass `pin` from `/shop`, `/shop/orders`, `/shop/replacements`.
- Remove the now-duplicate `<PushToggle>` from the shop header.

### 3. New `InstallButton` component (`src/components/install-button.tsx`)
- Listens for `beforeinstallprompt` on mount, stores the event, calls `prompt()` on click — standard Android/Chrome install flow.
- If already running standalone (`isStandaloneInstalled()`) → render nothing.
- If iOS Safari (not standalone) → show a button that opens a toast with the share-sheet instructions (mirrors `PushToggle`'s iOS hint).
- Otherwise, if the install event was captured → show "הוסף למסך הבית" button.
- If none of the above (desktop Chrome without prompt, unsupported browser) → render nothing so the sheet stays clean.

No backend or business logic changes.