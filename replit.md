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
- **Replit Auth**: OpenID Connect provider for user authentication
- Session secret via `SESSION_SECRET` environment variable

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

### Charting
- **Recharts**: Data visualization for reports (line, bar, area charts)

## Future Enhancements

### Email Notifications (Not Configured)
- Email notification feature was skipped during development
- To enable email notifications in the future:
  1. Set up SendGrid integration via Replit integrations
  2. Implement notification endpoints for:
     - Target exceedance alerts
     - Delay warnings
     - Weekly summary reports