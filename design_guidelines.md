# Design Guidelines: Construction Performance Tracking Platform

## Design Approach
**Reference-Based System Approach**: Drawing inspiration from İş Yatırım and Garanti BBVA Yatırım platforms, creating a professional financial dashboard aesthetic adapted for construction management. Clean, data-focused design emphasizing clarity and efficiency.

---

## Core Design Elements

### Typography
**Font Family**: Inter (primary), Roboto (fallback)

**Hierarchy**:
- Page Titles: 32px / font-bold
- Section Headers: 24px / font-semibold
- Card Titles: 18px / font-semibold
- Body Text: 16px / font-normal
- Labels/Captions: 14px / font-medium
- Small Text: 12px / font-normal

**Turkish Language Considerations**: Ensure proper rendering of Turkish characters (ı, İ, ş, ğ, ü, ö, ç)

### Layout System
**Spacing Primitives**: Tailwind units of 4, 6, and 8 (p-4, mt-6, mb-8, gap-4)
- Component padding: p-6
- Card spacing: gap-6
- Section margins: mt-8, mb-8
- Tight spacing: gap-4

**Container Structure**:
- Max width: max-w-7xl
- Page padding: px-4 md:px-6 lg:px-8
- Border radius: rounded-lg (8px)

### Grid System
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Metrics display: grid-cols-2 md:grid-cols-4
- Forms: Single column with max-w-2xl

---

## Component Library

### Navigation & Layout
**Top Header**:
- Height: h-16
- Logo (left), User menu (right)
- "Yeni Proje Oluştur" button (primary blue, top-right)
- White background with subtle bottom border

**Left Sidebar**:
- Width: w-64 (desktop), collapsible on mobile
- Project list with icons and status indicators
- Active project highlighted with blue accent border-l-4
- Hover state: light gray background

### Dashboard Cards
**Project Overview Cards**:
- White background with border
- Shadow: shadow-sm, hover:shadow-md transition
- Padding: p-6
- Progress bars for: adam-saat ratio, beton miktarı, geçen süre
- Color-coded status indicators (green/orange based on performance)

**Stat Cards**:
- Compact design with icon, label, value
- Grid layout for multiple metrics
- Large numbers (text-3xl font-bold)
- Trend indicators (↑/↓ arrows with percentages)

### Forms & Inputs
**Excel Upload Zone**:
- Dashed border with upload icon
- Drag-and-drop area
- File format indicator: ".xlsx kabul edilir"

**Data Entry Forms**:
- Clean, labeled inputs with Turkish placeholders
- Date pickers for günlük veri
- Number inputs for adam-saat and metraj
- Submit button (primary blue)

### Charts & Graphs
**Chart Container**:
- White card with p-6
- Header with chart title and period selector (Günlük/Haftalık/Aylık/Kümülatif tabs)
- Minimum height: min-h-96
- Use Recharts library for: Line charts (trend analysis), Bar charts (comparative data), Area charts (cumulative totals)

**Chart Colors**:
- Primary data: #1E3A8A (blue)
- Secondary data: #10B981 (green)
- Target lines: #F59E0B (orange, dashed)
- Grid lines: #E5E7EB (light gray)

### Tables
**Data Tables**:
- Striped rows (alternate light gray)
- Header: dark gray background, white text, font-semibold
- Responsive: horizontal scroll on mobile
- Action buttons in last column

### Buttons
**Primary**: bg-[#1E3A8A] text-white, hover states with opacity
**Secondary**: border-2 border-[#1E3A8A] text-[#1E3A8A]
**Success**: bg-[#10B981]
**Warning**: bg-[#F59E0B]

Size variants: px-4 py-2 (default), px-6 py-3 (large)

### Status Indicators
**Progress Bars**:
- Full width with rounded corners
- Multi-color based on percentage: <70% orange, 70-90% yellow, >90% green
- Show percentage label inside/beside bar

**Badges**:
- Small rounded pills (rounded-full px-3 py-1)
- Color-coded by status: "Aktif" (green), "Gecikmiş" (orange), "Tamamlandı" (blue)

---

## Page-Specific Layouts

### Login Page
- Centered card (max-w-md)
- Platform logo at top
- Simple form with email/password
- "Giriş Yap" primary button
- OAuth options below

### Main Dashboard
- Top header + left sidebar layout
- 3-column grid of project cards
- Each card shows: project name, 3 progress metrics, "Detayları Gör" link

### Project Detail Page
- Breadcrumb navigation
- Summary section: 4-column stat grid
- Tabs: Genel Bakış, Veri Girişi, Raporlar, Ayarlar
- Full-width chart sections
- Excel upload area in "Veri Girişi" tab

### Project Creation Modal
- Overlay with centered modal (max-w-3xl)
- Multi-step form or single long form with sections
- Excel upload for imalat kalemleri
- "Proje Oluştur" primary button

---

## Responsive Behavior
- **Desktop (lg:)**: Full sidebar visible, 3-column grids
- **Tablet (md:)**: Collapsible sidebar, 2-column grids
- **Mobile (base)**: Hamburger menu, single column, stacked layouts

---

## Visual Design Notes
- Clean, professional aesthetic similar to financial platforms
- Generous whitespace between sections
- Consistent use of cards for content grouping
- Subtle shadows for depth (avoid heavy drop shadows)
- Data visualization prioritized with prominent charts
- Turkish language throughout all labels, buttons, placeholders