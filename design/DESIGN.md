---
name: Warm Roasted Modernism
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf1'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fa'
  on-surface: '#111c2c'
  on-surface-variant: '#504440'
  inverse-surface: '#263142'
  inverse-on-surface: '#ebf1ff'
  outline: '#827470'
  outline-variant: '#d3c3be'
  surface-tint: '#74584e'
  primary: '#090100'
  on-primary: '#ffffff'
  primary-container: '#2c1810'
  on-primary-container: '#9e7e73'
  inverse-primary: '#e3bfb2'
  secondary: '#a0401c'
  on-secondary: '#ffffff'
  secondary-container: '#fe875d'
  on-secondary-container: '#722200'
  tertiary: '#000401'
  on-tertiary: '#ffffff'
  tertiary-container: '#00230f'
  on-tertiary-container: '#5e906c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#e3bfb2'
  on-primary-fixed: '#2a170f'
  on-primary-fixed-variant: '#5a4137'
  secondary-fixed: '#ffdbcf'
  secondary-fixed-dim: '#ffb59c'
  on-secondary-fixed: '#390c00'
  on-secondary-fixed-variant: '#802a05'
  tertiary-fixed: '#b9efc5'
  tertiary-fixed-dim: '#9dd3aa'
  on-tertiary-fixed: '#00210e'
  on-tertiary-fixed-variant: '#1e5031'
  background: '#f9f9ff'
  on-background: '#111c2c'
  surface-variant: '#d8e3fa'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  kpi-metric:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  kpi-metric-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 1.75rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for fast-paced specialty coffee operators, franchise owners, and store managers who need real-time clarity without visual clutter. The visual character merges the warmth and craft of independent café culture with the clinical precision required of enterprise ERP and daily cash settlement software.

The design philosophy adopts a refined tactile minimalism:
- **Calm & Grounded Canvas:** Replacing stark corporate blues and sterile pure whites with layered oatmeal, rich milk foam tones, and deep roasted espresso hues.
- **High-Velocity Density:** Built for bustling floor and back-office environments where legibility at a glance, clear operational hierarchy, and rapid finger- or barcode-adjacent inputs are critical.
- **Intentional Restraint:** Visual noise is minimized. Depth is established through warm tonal contrast, subtle border delineations, and targeted status indicators rather than decorative gradients.

## Colors

The palette balances warm organic café tones with unambiguous operational feedback tokens:

- **Primary (`#2C1810` - Deep Espresso):** Anchors visual hierarchy. Used for top-level headers, primary key action buttons, and dominant operational metrics. Gives authority and grounded prestige.
- **Secondary (`#D96B43` - Terracotta Rust):** Directs focal attention to critical operational calls to action, urgent inventory thresholds, settlement validations, and active states.
- **Tertiary (`#4A7C59` - Sage Pine):** Reserved exclusively for positive cash flow, healthy margins, completed daily settlement status badges, and verified inventory counts.
- **Neutral (`#4A5568` - Slate Charcoal):** Governs secondary labels, table headers, breadcrumbs, and inactive metadata.
- **Surfaces & Backgrounds:**
  - Base Canvas (`#FBF9F6` - Warm Oatmeal Linen): Lowers eye fatigue during prolonged backlit screen sessions.
  - Surface Raised / Card Container (`#FFFFFF`): Crisp white islands placed against the oatmeal canvas to separate data modules cleanly.
  - Surface Subdued (`#F3EFEA` - Cream Mist): Used for secondary toolbar strips, table header rows, input backgrounds, and hovered elements.
- **Operational Status Tokens:**
  - Critical / Deficiency: `#C53030` (Crimson)
  - Pending / Warning: `#DD6B20` (Warm Amber)
  - Virtual Example / Informative Notice: `#5A67D8` (Muted Indigo)

## Typography

The typographic hierarchy prioritizes instantaneous recognition of revenue digits, stock quantities, and operational flags:

- **Primary Typeface:** `Inter` is utilized throughout for its neutral structure, high x-height, and robust multi-language consistency alongside native Korean typefaces (such as Pretendard or Apple SD Gothic Neo).
- **Tabular Figures (`tnum`):** All financial summaries, inventory ledgers, reconciliation totals, and settlement data grids must explicitly enforce `font-feature-settings: "tnum" 1, "cv05" 1` to prevent jitter during numerical recalculations and ensure vertical alignment.
- **Hierarchy Rules:**
  - Large headline scales are strictly reserved for core dashboard revenue rolls and page category demarcations.
  - Body text settles at 13px–14px to balance high density with clarity on desktop and POS tablet terminals.
  - Labels and badges use micro uppercase or semi-bold weights for scanning efficiency.

## Layout & Spacing

The dashboard employs a fluid enterprise grid optimized for 12 columns on desktop workstations, 8 columns on tablet landscape/POS mounts, and a vertical single-column stack for mobile smartphones:

- **Desktop (>= 1280px):**
  - Left navigation rail: Fixed 240px width with deep espresso branding.
  - Content area: 12-column fluid grid, 20px gutters, and 28px canvas padding.
- **Tablet / POS Mount (768px – 1279px):**
  - Left navigation collapses to an 72px icon-only dock or slide-over drawer.
  - 8-column layout with 16px gutters to accommodate split POS reconciliation workflows.
- **Mobile (< 768px):**
  - Collapsible top app header with quick store switcher and bottom action dock.
  - Single column reflow with 12px gutters and 16px page margins.
- **Density Principle:** Content modules rely on modular 4px baseline increments. Dense list rows maintain a 44px minimum vertical tap target on touch screens while condensing to 36px on pointer desktop modes.

## Elevation & Depth

This design system avoids heavy shadows, instead leveraging tonal contrast, structured hairline borders, and warm atmospheric diffusion:

- **Flat Layering (`Level 0`):** The primary workspace sits on `#FBF9F6`.
- **Card Tier (`Level 1`):** Panels, KPI metric blocks, and table containers are `#FFFFFF` surfaced with a 1px solid border in `#E5DFD7` (warm stone line) and an ultra-subtle tinted shadow: `0 1px 3px rgba(44, 24, 16, 0.04)`.
- **Floating Modals & Flyouts (`Level 2`):** Dropdowns, quick filter menus, and action sheets utilize:
  `box-shadow: 0 10px 25px -5px rgba(44, 24, 16, 0.10), 0 8px 10px -6px rgba(44, 24, 16, 0.06);` with a 1px border `#DED7CE`.
- **System Overlay (`Level 3`):** Modal dialogs for settlement closure and inventory adjustments feature a translucent deep espresso tint backdrop (`rgba(44, 24, 16, 0.6)`) with a subtle `backdrop-filter: blur(4px)`.

## Shapes

The shape system adopts a balanced, contemporary rounded corner architecture (`Level 2`):

- **Default Element Radius (`0.5rem` / `8px`):** Applied to standard buttons, text inputs, select boxes, and alert containers. It softens the corporate feel without sacrificing screen real estate.
- **Card & Modal Radius (`1rem` / `16px`):** Applied to standalone KPI modules, operational cards, and popup dialogs to enclose grouped information naturally.
- **Badge & Indicator Radius (`9999px` / Full Pill):** Used for status tags ("마감 완료", "실사 기록 없음", "가상 예시") to clearly differentiate actionable controls from passive operational state markers.

## Components

### Buttons & Interactive Controls
- **Primary Action (Espresso Solid):** `#2C1810` background, `#FFFFFF` text. On hover, shifts to `#42261B`. Reserved for decisive triggers (e.g., "당일 정산 마감 확정", "재고 반영").
- **Secondary Action (Terracotta Outlined or Solid):** Terracotta (`#D96B43`) with white text for active highlight actions, or outlined in `#D96B43` with 1.5px border for auxiliary secondary paths.
- **Subtle / Ghost Action:** Transparent background with `#4A5568` text; transitions to `#F3EFEA` background on hover. Used for table toolbars, row expansions, and pagination controls.

### Status Badges & Chips
Badges use pill geometry (`rounded-full`), `label-sm` typography, and low-saturation backgrounds paired with dark text to prevent visual alarms:
- **마감 완료 (Settlement Completed):** Background `#EAF2EC`, text `#2A5737`, dot indicator `#4A7C59`.
- **실사 기록 없음 (Missing Inspection):** Background `#FDF0EB`, text `#9C3B1E`, dot indicator `#D96B43`.
- **가상 예시 (Simulation / Demo Record):** Background `#EEF2FF`, text `#374094`, border `1px dashed #A5B4FC`.
- **확인 필요 (Action Required):** Background `#FFF7ED`, text `#9A3412`, dot indicator `#EA580C`.

### KPI Metric Cards
- Background: Pure White (`#FFFFFF`), border 1px `#E5DFD7`.
- Structure:
  - Top: Micro category label (`label-md`, `#718096`) alongside an optional contextual trend badge (`+12.4% vs 전주`).
  - Middle: High-impact number (`kpi-metric`, `#2C1810`) with tabular numeric spacing.
  - Bottom: Micro subtitle indicating baseline ("어제 마감 대비", "원두 로스율 0.8%").

### Data Tables
- Header: `#F3EFEA` fill, `#4A5568` text, uppercase `label-md`, sticky positioning.
- Rows: `#FFFFFF` fill with bottom border 1px solid `#F3EFEA`. Alternating subtle zebra striping optional for large dataset scanning. Hover state uses `#FAF7F2`.
- Numeric Cells: Aligned right, rendered in mono-spaced tabular numbers with consistent decimal formatting.

### Modal Dialogs
- Centered on screen, max-width 560px for settlement confirmations and 720px for detailed prep-recipe adjustment logs.
- Header accompanied by an icon badge in terracotta or deep espresso.
- Distinct footer action zone separated by a hairline border, with primary completion button docked on the bottom right.

### Responsive Sidebar & Navigation Tabs
- **Sidebar:** Espresso tinted `#21120B` surface in dark mode contrast or cream stone `#FAF7F2` in light mode contrast. Includes active indicator accent bar in Terracotta (`#D96B43`).
- **Segmented Tabs:** Pill or tabbed container with `#F3EFEA` background; selected tab features white elevated chip (`#FFFFFF`) with crisp text.