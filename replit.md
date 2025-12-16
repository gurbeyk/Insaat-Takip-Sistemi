# Construction Performance Tracking Platform

## Overview

This is a construction project performance tracking application designed for Turkish-speaking users. It enables construction managers to track daily man-hours, concrete quantities, and project progress against planned targets. The platform provides data visualization through charts and reports, with Excel import/export capabilities for work items and daily entries.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, built using Vite
- Client-side routing via `wouter` (lightweight alternative to React Router)
- State management with TanStack Query for server state caching and synchronization
- Form handling with React Hook Form and Zod validation

**UI Components**: shadcn/ui component library (New York style variant)
- Built on Radix UI primitives for accessibility
- Tailwind CSS for styling with custom CSS variables for theming
- Dark/light mode support via ThemeProvider context
- Responsive sidebar layout with collapsible navigation

**Key Frontend Patterns**:
- Components organized by feature (pages) and reusability (components/ui)
- Custom hooks for authentication (`useAuth`) and mobile detection (`use-mobile`)
- Centralized API request handling through `queryClient.ts`
- Turkish language UI with proper character support

### Backend Architecture

**Framework**: Express.js with TypeScript
- RESTful API design with `/api` prefix
- Session-based authentication using Replit Auth (OpenID Connect)
- PostgreSQL database with Drizzle ORM

**Authentication**: Replit Auth integration
- OpenID Connect flow via `openid-client` library
- Session storage in PostgreSQL via `connect-pg-simple`
- Passport.js strategy for session management

**Data Layer**: Storage interface pattern
- `IStorage` interface abstracts database operations
- Drizzle ORM for type-safe database queries
- Schema defined in shared directory for frontend/backend type sharing

### Data Model

**Core Entities**:
- `users`: User accounts with roles (admin/editor/viewer)
- `projects`: Construction projects with planned metrics
- `workItems`: Individual work items within projects (budget code, unit, targets)
- `dailyEntries`: Daily progress records (man-hours, quantities)
- `monthlySchedule`: Monthly planning data
- `monthlyWorkItemSchedule`: Work item monthly planned quantities (İş Programı) with year/month/workItemId/plannedQuantity
- `projectMembers`: Project access control
- `sessions`: Authentication session storage

### Build System

**Development**: Vite dev server with HMR
- Hot module replacement via WebSocket
- Replit-specific plugins for development experience

**Production**: Two-stage build process
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server with selected dependencies for faster cold starts

## External Dependencies

### Database
- **PostgreSQL**: Primary data store (provisioned via Replit)
- **Drizzle ORM**: Type-safe database access with schema migrations
- Connection via `DATABASE_URL` environment variable

### Authentication
- **Local Authentication**: Passport.js with LocalStrategy for username/password login
- **Password Hashing**: bcryptjs for secure password storage
- **Session Management**: express-session with PostgreSQL store via `connect-pg-simple`
- Session secret via `SESSION_SECRET` environment variable
- **User Registration**: New users register via project invitation links
  - When invitation link is clicked, user sees password creation form
  - Email address is used as username
  - Password is hashed with bcrypt before storing
  - User is automatically logged in after registration

### File Storage
- **Google Cloud Storage**: File upload capability (via `@google-cloud/storage`)
- **Uppy**: File upload UI components with dashboard

### Data Processing
- **xlsx**: Excel file parsing for bulk data import/export

### Work Schedule (İş Programı) Excel Import
- Supports multiple date formats: Excel serial dates, ISO (YYYY-MM), Turkish month names (Ocak, Şubat, etc.), English month names, and short formats (01/24, 01-24)
- Uses Turkish locale-safe normalization for character handling (İ/ı)
- Validation with detailed error feedback showing skipped rows with examples
- Frontend and backend guards prevent empty uploads from wiping existing data

### Monthly Concrete Performance Chart
- Reports > Aylık tab includes "Aylık İmalat Performansı (Beton - m3)" section
- Shows actual monthly concrete production (blue) from daily entries where unit = "m3"
- Shows planned monthly concrete (orange) from İş Programı (work schedule) data
- Matches work schedule entries where workItemName is "Temel" or "Ustyapi" (foundation and superstructure concrete)
- Sums both columns per month (e.g., Temel 804 + Ustyapi 877 = 1681)
- Date filtering respects year/month boundaries correctly

### Earned Man-Hours (Kazanılan Adam Saat)
- Calculation: daily quantity × unit man-hours (birim adam saat) from work item template
- Example: 4.845 m³ × 51.30 adam saat/m³ = 248.55 kazanılan adam saat
- Available in reports API:
  - daily/weekly/monthly data includes earnedManHours field
  - workItems array includes earnedManHours per work item
  - summary includes totalEarnedManHours for entire project
- Used for performance analysis: comparing spent vs earned man-hours

### Charting
- **Recharts**: Data visualization for reports (line, bar, area charts)

### Weather Integration
- **Open-Meteo API**: Free weather service, no API key required
- Weather endpoint: GET /api/weather/:location
- Uses geocoding to convert city names to coordinates
- Features:
  - Current temperature and conditions
  - Today's high/low temperatures
  - 7-day weather forecast
  - Turkish weather descriptions (Açık, Bulutlu, Yağmurlu, etc.)
  - Weather icons (sun, cloud-sun, cloud, cloud-rain, snowflake, etc.)
- Project location field in Settings tab enables weather display
- Weather widget shows on Project Detail page (right side) when location is set
- Turkish date formatting for forecast display

## Future Enhancements

### Email Notifications (Not Configured)
- Email notification feature was skipped during development
- To enable email notifications in the future:
  1. Set up SendGrid integration via Replit integrations
  2. Implement notification endpoints for:
     - Target exceedance alerts
     - Delay warnings
     - Weekly summary reports