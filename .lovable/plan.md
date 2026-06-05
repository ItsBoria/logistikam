## Goal
Match the look of the mockup: new blue "M-bag" logo, brand blue, welcoming shop header, and a bottom tab bar.

## Steps

1. **Upload logo as CDN asset**
   - `lovable-assets create --file /mnt/user-uploads/28F769C0-8AF9-405A-B0DF-DD3F47AF5326.png --filename logikam-logo.png > src/assets/logikam-logo.png.asset.json`
   - Use it for: PWA favicon (`public/manifest.webmanifest`, `__root.tsx` link tags), login screen header, shop header, splash.

2. **Brand color**
   - Set `--primary` in `src/styles.css` to the logo blue (~`oklch(0.48 0.22 264)` ≈ `#1E40FF`) and a soft `--primary-glow`. Keep semantic tokens (no hardcoded colors in components).

3. **Login screen (`src/routes/index.tsx`)**
   - Replace the `ShoppingBag` icon block with the new logo image.
   - Keep PIN form, just refine spacing/typography to match the mockup's clean centered look.

4. **Shop screen (`src/routes/shop.index.tsx`)**
   - Header: centered logo + "ברוכים הבאים" + subtitle "מה תרצו להזמין היום?".
   - Add search input ("חיפוש מוצר…"), category dropdown ("כל הקטגוריות"), and "במלאי בלבד" toggle above the grid.
   - Product card: image, title, "1 יח׳ · מלאי: N", price, full-width blue "הוסף" button (matches mockup).
   - Replace top header action buttons with a fixed **bottom tab bar**: בית · קטגוריות · הזמנות שלי · עוד.
   - "עוד" opens a sheet with: החלפות, יציאה, (admin link if relevant).

5. **Other shop routes** (`shop.orders.tsx`, `shop.replacements.tsx`)
   - Same bottom tab bar + logo header for consistency.

6. **PWA**
   - Update `public/manifest.webmanifest` name/icons to the new logo. Update theme color to brand blue.

## Out of scope
- No business-logic changes (orders, replacements, admin flows untouched).
- Admin screens keep their current shell.

## Open question
Bottom tab "עוד" — should it include a link to **כניסת מנהלים** like the current login screen has, or hide that entirely from teams?