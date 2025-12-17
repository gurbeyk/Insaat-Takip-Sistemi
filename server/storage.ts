import {
  users,
  projects,
  workItems,
  dailyEntries,
  monthlySchedule,
  monthlyWorkItemSchedule,
  projectMembers,
  projectInvitations,
  type User,
  type UpsertUser,
  type Project,
  type InsertProject,
  type WorkItem,
  type InsertWorkItem,
  type DailyEntry,
  type InsertDailyEntry,
  type MonthlySchedule,
  type InsertMonthlySchedule,
  type MonthlyWorkItemSchedule,
  type InsertMonthlyWorkItemSchedule,
  type ProjectMember,
  type InsertProjectMember,
  type ProjectInvitation,
  type InsertProjectInvitation,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, between, gte, lte } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectForUser(projectId: string, userId: string): Promise<Project | undefined>;
  canAccessProject(projectId: string, userId: string): Promise<boolean>;
  isProjectAdmin(projectId: string, userId: string): Promise<boolean>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  
  getWorkItems(projectId: string): Promise<WorkItem[]>;
  createWorkItem(workItem: InsertWorkItem): Promise<WorkItem>;
  createWorkItems(workItems: InsertWorkItem[]): Promise<WorkItem[]>;
  deleteWorkItems(projectId: string): Promise<void>;
  
  getDailyEntries(projectId: string): Promise<DailyEntry[]>;
  getDailyEntriesByDateRange(projectId: string, startDate: string, endDate: string): Promise<DailyEntry[]>;
  getDailyEntry(id: string): Promise<DailyEntry | undefined>;
  createDailyEntry(entry: InsertDailyEntry): Promise<DailyEntry>;
  createDailyEntries(entries: InsertDailyEntry[]): Promise<DailyEntry[]>;
  updateDailyEntry(id: string, entry: Partial<InsertDailyEntry>): Promise<DailyEntry | undefined>;
  deleteDailyEntry(id: string): Promise<void>;
  
  getMonthlySchedule(projectId: string): Promise<MonthlySchedule[]>;
  upsertMonthlySchedule(schedule: InsertMonthlySchedule): Promise<MonthlySchedule>;
  deleteMonthlySchedule(projectId: string): Promise<void>;
  bulkUpsertMonthlySchedule(schedules: InsertMonthlySchedule[]): Promise<MonthlySchedule[]>;
  
  getMonthlyWorkItemSchedule(projectId: string): Promise<MonthlyWorkItemSchedule[]>;
  createMonthlyWorkItemSchedules(schedules: InsertMonthlyWorkItemSchedule[]): Promise<MonthlyWorkItemSchedule[]>;
  deleteMonthlyWorkItemSchedule(projectId: string): Promise<void>;
  
  getProjectMembers(projectId: string): Promise<ProjectMember[]>;
  getProjectMembersWithUsers(projectId: string): Promise<(ProjectMember & { user: User | null })[]>;
  addProjectMember(member: InsertProjectMember): Promise<ProjectMember>;
  updateProjectMemberRole(projectId: string, userId: string, role: string): Promise<ProjectMember | undefined>;
  removeProjectMember(projectId: string, userId: string): Promise<void>;
  
  getProjectInvitations(projectId: string): Promise<ProjectInvitation[]>;
  getInvitationByToken(token: string): Promise<ProjectInvitation | undefined>;
  createProjectInvitation(invitation: InsertProjectInvitation): Promise<ProjectInvitation>;
  updateInvitationStatus(id: string, status: string): Promise<ProjectInvitation | undefined>;
  deleteProjectInvitation(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.firstName);
  }

  async getProjects(userId: string): Promise<Project[]> {
    const ownedProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.createdBy, userId))
      .orderBy(desc(projects.createdAt));
    
    const memberProjects = await db
      .select({ project: projects })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, userId));
    
    const memberProjectIds = new Set(memberProjects.map(mp => mp.project.id));
    const allProjects = [
      ...ownedProjects,
      ...memberProjects
        .filter(mp => !ownedProjects.find(op => op.id === mp.project.id))
        .map(mp => mp.project)
    ];
    
    return allProjects;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectForUser(projectId: string, userId: string): Promise<Project | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;
    
    if (project.createdBy === userId) {
      return project;
    }
    
    const membership = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      );
    
    if (membership.length > 0) {
      return project;
    }
    
    return undefined;
  }

  async canAccessProject(projectId: string, userId: string): Promise<boolean> {
    const project = await this.getProjectForUser(projectId, userId);
    return project !== undefined;
  }

  async isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
    const project = await this.getProject(projectId);
    if (!project) return false;
    
    if (project.createdBy === userId) {
      return true;
    }
    
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          eq(projectMembers.role, "admin")
        )
      );
    
    return !!membership;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db
      .update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getWorkItems(projectId: string): Promise<WorkItem[]> {
    return await db
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, projectId))
      .orderBy(workItems.budgetCode);
  }

  async createWorkItem(workItem: InsertWorkItem): Promise<WorkItem> {
    const [newItem] = await db.insert(workItems).values(workItem).returning();
    return newItem;
  }

  async createWorkItems(items: InsertWorkItem[]): Promise<WorkItem[]> {
    if (items.length === 0) return [];
    return await db.insert(workItems).values(items).returning();
  }

  async deleteWorkItems(projectId: string): Promise<void> {
    await db.delete(workItems).where(eq(workItems.projectId, projectId));
  }

  async getDailyEntries(projectId: string): Promise<DailyEntry[]> {
    return await db
      .select()
      .from(dailyEntries)
      .where(eq(dailyEntries.projectId, projectId))
      .orderBy(desc(dailyEntries.entryDate));
  }

  async getDailyEntriesByDateRange(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyEntry[]> {
    return await db
      .select()
      .from(dailyEntries)
      .where(
        and(
          eq(dailyEntries.projectId, projectId),
          gte(dailyEntries.entryDate, startDate),
          lte(dailyEntries.entryDate, endDate)
        )
      )
      .orderBy(dailyEntries.entryDate);
  }

  async getDailyEntry(id: string): Promise<DailyEntry | undefined> {
    const [entry] = await db.select().from(dailyEntries).where(eq(dailyEntries.id, id));
    return entry;
  }

  async createDailyEntry(entry: InsertDailyEntry): Promise<DailyEntry> {
    const [newEntry] = await db.insert(dailyEntries).values(entry).returning();
    return newEntry;
  }

  async createDailyEntries(entries: InsertDailyEntry[]): Promise<DailyEntry[]> {
    if (entries.length === 0) return [];
    return await db.insert(dailyEntries).values(entries).returning();
  }

  async updateDailyEntry(id: string, entry: Partial<InsertDailyEntry>): Promise<DailyEntry | undefined> {
    const [updated] = await db
      .update(dailyEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(dailyEntries.id, id))
      .returning();
    return updated;
  }

  async deleteDailyEntry(id: string): Promise<void> {
    await db.delete(dailyEntries).where(eq(dailyEntries.id, id));
  }

  async getMonthlySchedule(projectId: string): Promise<MonthlySchedule[]> {
    return await db
      .select()
      .from(monthlySchedule)
      .where(eq(monthlySchedule.projectId, projectId))
      .orderBy(monthlySchedule.year, monthlySchedule.month);
  }

  async upsertMonthlySchedule(schedule: InsertMonthlySchedule): Promise<MonthlySchedule> {
    const existing = await db
      .select()
      .from(monthlySchedule)
      .where(
        and(
          eq(monthlySchedule.projectId, schedule.projectId),
          eq(monthlySchedule.year, schedule.year),
          eq(monthlySchedule.month, schedule.month)
        )
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(monthlySchedule)
        .set(schedule)
        .where(eq(monthlySchedule.id, existing[0].id))
        .returning();
      return updated;
    }

    const [newSchedule] = await db.insert(monthlySchedule).values(schedule).returning();
    return newSchedule;
  }

  async deleteMonthlySchedule(projectId: string): Promise<void> {
    await db.delete(monthlySchedule).where(eq(monthlySchedule.projectId, projectId));
  }

  async bulkUpsertMonthlySchedule(schedules: InsertMonthlySchedule[]): Promise<MonthlySchedule[]> {
    if (schedules.length === 0) return [];
    
    const results: MonthlySchedule[] = [];
    for (const schedule of schedules) {
      const result = await this.upsertMonthlySchedule(schedule);
      results.push(result);
    }
    return results;
  }

  async getMonthlyWorkItemSchedule(projectId: string): Promise<MonthlyWorkItemSchedule[]> {
    return await db
      .select()
      .from(monthlyWorkItemSchedule)
      .where(eq(monthlyWorkItemSchedule.projectId, projectId))
      .orderBy(monthlyWorkItemSchedule.workItemName, monthlyWorkItemSchedule.year, monthlyWorkItemSchedule.month);
  }

  async createMonthlyWorkItemSchedules(schedules: InsertMonthlyWorkItemSchedule[]): Promise<MonthlyWorkItemSchedule[]> {
    if (schedules.length === 0) return [];
    const inserted = await db.insert(monthlyWorkItemSchedule).values(schedules).returning();
    return inserted;
  }

  async deleteMonthlyWorkItemSchedule(projectId: string): Promise<void> {
    await db.delete(monthlyWorkItemSchedule).where(eq(monthlyWorkItemSchedule.projectId, projectId));
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
  }

  async getProjectMembersWithUsers(projectId: string): Promise<(ProjectMember & { user: User | null })[]> {
    const members = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    
    const membersWithUsers = await Promise.all(
      members.map(async (member) => {
        const [user] = await db.select().from(users).where(eq(users.id, member.userId));
        return { ...member, user: user || null };
      })
    );
    
    return membersWithUsers;
  }

  async addProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    const [newMember] = await db.insert(projectMembers).values(member).returning();
    return newMember;
  }

  async updateProjectMemberRole(projectId: string, userId: string, role: string): Promise<ProjectMember | undefined> {
    const [updated] = await db
      .update(projectMembers)
      .set({ role })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      )
      .returning();
    return updated;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      );
  }

  async getProjectInvitations(projectId: string): Promise<ProjectInvitation[]> {
    return await db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.projectId, projectId))
      .orderBy(desc(projectInvitations.createdAt));
  }

  async getInvitationByToken(token: string): Promise<ProjectInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.token, token));
    return invitation;
  }

  async createProjectInvitation(invitation: InsertProjectInvitation): Promise<ProjectInvitation> {
    const [newInvitation] = await db
      .insert(projectInvitations)
      .values(invitation)
      .returning();
    return newInvitation;
  }

  async updateInvitationStatus(id: string, status: string): Promise<ProjectInvitation | undefined> {
    const [updated] = await db
      .update(projectInvitations)
      .set({ status })
      .where(eq(projectInvitations.id, id))
      .returning();
    return updated;
  }

  async deleteProjectInvitation(id: string): Promise<void> {
    await db.delete(projectInvitations).where(eq(projectInvitations.id, id));
  }
}

export const storage = new DatabaseStorage();
