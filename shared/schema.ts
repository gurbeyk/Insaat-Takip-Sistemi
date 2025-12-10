import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  real,
  timestamp,
  date,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"), // 'admin', 'editor', 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Projects table
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  plannedManHours: real("planned_man_hours").notNull().default(0),
  totalDuration: integer("total_duration").notNull().default(0), // days
  totalConcrete: real("total_concrete").default(0), // m³
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: varchar("status").default("active"), // 'active', 'completed', 'paused'
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Work Items (İmalat Kalemleri) - from Excel upload
export const workItems = pgTable("work_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentBudgetCode: varchar("parent_budget_code"), // Bütçe kodu üst öge
  category: varchar("category"), // İmalat ayrımı
  budgetCode: varchar("budget_code").notNull(),
  name: varchar("name").notNull(),
  unit: varchar("unit").notNull(), // m², m³, kg, adet etc.
  targetQuantity: real("target_quantity").notNull().default(0),
  targetManHours: real("target_man_hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily Entries (Günlük Veri Girişi)
export const dailyEntries = pgTable("daily_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  workItemId: varchar("work_item_id").notNull().references(() => workItems.id, { onDelete: "cascade" }),
  entryDate: date("entry_date").notNull(),
  manHours: real("man_hours").notNull().default(0),
  quantity: real("quantity").notNull().default(0), // metraj
  notes: text("notes"),
  enteredBy: varchar("entered_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Monthly Schedule (Aylık İş Programı)
export const monthlySchedule = pgTable("monthly_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  plannedManHours: real("planned_man_hours").notNull().default(0),
  plannedConcrete: real("planned_concrete").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project members for authorization
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role").notNull().default("viewer"), // 'admin', 'editor', 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  projectMembers: many(projectMembers),
  dailyEntries: many(dailyEntries),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  workItems: many(workItems),
  dailyEntries: many(dailyEntries),
  monthlySchedule: many(monthlySchedule),
  members: many(projectMembers),
}));

export const workItemsRelations = relations(workItems, ({ one, many }) => ({
  project: one(projects, {
    fields: [workItems.projectId],
    references: [projects.id],
  }),
  dailyEntries: many(dailyEntries),
}));

export const dailyEntriesRelations = relations(dailyEntries, ({ one }) => ({
  project: one(projects, {
    fields: [dailyEntries.projectId],
    references: [projects.id],
  }),
  workItem: one(workItems, {
    fields: [dailyEntries.workItemId],
    references: [workItems.id],
  }),
  enteredByUser: one(users, {
    fields: [dailyEntries.enteredBy],
    references: [users.id],
  }),
}));

export const monthlyScheduleRelations = relations(monthlySchedule, ({ one }) => ({
  project: one(projects, {
    fields: [monthlySchedule.projectId],
    references: [projects.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkItemSchema = createInsertSchema(workItems).omit({
  id: true,
  createdAt: true,
});

export const insertDailyEntrySchema = createInsertSchema(dailyEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMonthlyScheduleSchema = createInsertSchema(monthlySchedule).omit({
  id: true,
  createdAt: true,
});

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type WorkItem = typeof workItems.$inferSelect;
export type InsertWorkItem = z.infer<typeof insertWorkItemSchema>;

export type DailyEntry = typeof dailyEntries.$inferSelect;
export type InsertDailyEntry = z.infer<typeof insertDailyEntrySchema>;

export type MonthlySchedule = typeof monthlySchedule.$inferSelect;
export type InsertMonthlySchedule = z.infer<typeof insertMonthlyScheduleSchema>;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
