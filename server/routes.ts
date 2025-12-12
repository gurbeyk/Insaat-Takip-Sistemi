import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertProjectSchema,
  insertWorkItemSchema,
  insertDailyEntrySchema,
  insertMonthlyScheduleSchema,
  insertMonthlyWorkItemScheduleSchema,
  insertProjectMemberSchema,
  insertProjectInvitationSchema,
} from "@shared/schema";
import crypto from "crypto";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/with-stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getProjects(userId);
      
      const projectsWithStats = await Promise.all(
        projects.map(async (project) => {
          const entries = await storage.getDailyEntries(project.id);
          const workItems = await storage.getWorkItems(project.id);
          const m3WorkItemIds = new Set(workItems.filter(w => w.unit === 'm3').map(w => w.id));
          const spentManHours = entries.reduce((sum, e) => sum + (e.manHours || 0), 0);
          const pouredConcrete = entries.reduce((sum, e) => m3WorkItemIds.has(e.workItemId) ? sum + (e.quantity || 0) : sum, 0);
          
          let elapsedDays = 0;
          if (project.startDate) {
            const start = new Date(project.startDate);
            const now = new Date();
            elapsedDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            elapsedDays = Math.max(0, elapsedDays);
          }
          
          return {
            ...project,
            spentManHours,
            pouredConcrete,
            elapsedDays,
          };
        })
      );
      
      res.json(projectsWithStats);
    } catch (error) {
      console.error("Error fetching projects with stats:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const project = await storage.getProjectForUser(projectId, userId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const workItems = await storage.getWorkItems(projectId);
      const dailyEntries = await storage.getDailyEntries(projectId);
      
      const m3WorkItemIds = new Set(workItems.filter(w => w.unit === 'm3').map(w => w.id));
      const spentManHours = dailyEntries.reduce((sum, e) => sum + (e.manHours || 0), 0);
      const pouredConcrete = dailyEntries.reduce((sum, e) => m3WorkItemIds.has(e.workItemId) ? sum + (e.quantity || 0) : sum, 0);
      
      let elapsedDays = 0;
      if (project.startDate) {
        const start = new Date(project.startDate);
        const now = new Date();
        elapsedDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        elapsedDays = Math.max(0, elapsedDays);
      }
      
      res.json({
        ...project,
        spentManHours,
        pouredConcrete,
        elapsedDays,
        workItems,
        dailyEntries,
      });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const body = { ...req.body };
      const workItems = body.workItems || [];
      delete body.workItems;
      
      if (body.startDate === "") body.startDate = null;
      if (body.endDate === "") body.endDate = null;
      
      const parsed = insertProjectSchema.parse({
        ...body,
        createdBy: userId,
      });
      
      const project = await storage.createProject(parsed);
      
      // Create work items if provided
      if (workItems.length > 0) {
        for (const item of workItems) {
          const workItemData = insertWorkItemSchema.parse({
            projectId: project.id,
            parentBudgetCode: item.parentBudgetCode,
            category: item.category,
            budgetCode: item.budgetCode,
            name: item.name,
            unit: item.unit,
            targetQuantity: item.targetQuantity,
            targetManHours: item.targetManHours,
          });
          await storage.createWorkItem(workItemData);
        }
      }
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const project = await storage.getProjectForUser(projectId, userId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const body = { ...req.body };
      if (body.startDate === "") body.startDate = null;
      if (body.endDate === "") body.endDate = null;
      
      const updated = await storage.updateProject(projectId, body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const project = await storage.getProjectForUser(projectId, userId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      await storage.deleteProject(projectId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/projects/:id/work-items", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const workItems = await storage.getWorkItems(projectId);
      res.json(workItems);
    } catch (error) {
      console.error("Error fetching work items:", error);
      res.status(500).json({ message: "Failed to fetch work items" });
    }
  });

  app.post("/api/projects/:id/work-items", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const parsed = insertWorkItemSchema.parse({
        ...req.body,
        projectId,
      });
      
      const workItem = await storage.createWorkItem(parsed);
      res.status(201).json(workItem);
    } catch (error) {
      console.error("Error creating work item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid work item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work item" });
    }
  });

  app.post("/api/projects/:id/work-items/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const items = req.body.items as any[];
      
      await storage.deleteWorkItems(projectId);
      
      const parsedItems = items.map((item) =>
        insertWorkItemSchema.parse({
          ...item,
          projectId,
        })
      );
      
      const workItems = await storage.createWorkItems(parsedItems);
      res.status(201).json(workItems);
    } catch (error) {
      console.error("Error bulk creating work items:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid work item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work items" });
    }
  });

  // Monthly Work Item Schedule (İş Programı) endpoints
  app.get("/api/projects/:id/work-schedule", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const schedule = await storage.getMonthlyWorkItemSchedule(projectId);
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching work schedule:", error);
      res.status(500).json({ message: "Failed to fetch work schedule" });
    }
  });

  app.post("/api/projects/:id/work-schedule/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const items = req.body.items as any[];
      
      // Guard: reject empty arrays to prevent accidentally wiping existing schedules
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "En az bir kayıt gerekli. Boş veri gönderilemez." });
      }
      
      // Delete existing schedule for this project before importing new one
      await storage.deleteMonthlyWorkItemSchedule(projectId);
      
      const parsedItems = items.map((item) =>
        insertMonthlyWorkItemScheduleSchema.parse({
          ...item,
          projectId,
        })
      );
      
      const schedule = await storage.createMonthlyWorkItemSchedules(parsedItems);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error bulk creating work schedule:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid work schedule data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create work schedule" });
    }
  });

  app.get("/api/projects/:id/entries", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      let entries;
      if (startDate && endDate) {
        entries = await storage.getDailyEntriesByDateRange(projectId, startDate as string, endDate as string);
      } else {
        entries = await storage.getDailyEntries(projectId);
      }
      
      // Get workItems to include in entries
      const workItems = await storage.getWorkItems(projectId);
      const workItemMap = new Map(workItems.map(wi => [wi.id, wi]));
      
      const entriesWithWorkItems = entries.map(entry => ({
        ...entry,
        workItem: workItemMap.get(entry.workItemId) || null,
      }));
      
      res.json(entriesWithWorkItems);
    } catch (error) {
      console.error("Error fetching entries:", error);
      res.status(500).json({ message: "Failed to fetch entries" });
    }
  });

  app.post("/api/projects/:id/entries", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const parsed = insertDailyEntrySchema.parse({
        ...req.body,
        projectId,
        enteredBy: userId,
      });
      
      const entry = await storage.createDailyEntry(parsed);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating entry:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid entry data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create entry" });
    }
  });

  app.post("/api/projects/:id/entries/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const items = req.body.entries as any[];
      const uploadType = req.body.type as string; // 'progress' or 'manhours'
      
      const parsedEntries = items.map((entry) => {
        if (uploadType === 'progress') {
          const noteParts: string[] = [];
          if (entry.ratio) noteParts.push(`Oran: ${entry.ratio}`);
          if (entry.region) noteParts.push(`Bölge: ${entry.region}`);
          return insertDailyEntrySchema.parse({
            workItemId: entry.workItemId,
            entryDate: entry.entryDate,
            quantity: entry.quantity,
            manHours: 0,
            notes: noteParts.join(', '),
            projectId,
            enteredBy: userId,
          });
        } else if (uploadType === 'manhours') {
          return insertDailyEntrySchema.parse({
            workItemId: entry.workItemId,
            entryDate: entry.entryDate,
            manHours: entry.manHours,
            quantity: 0,
            notes: '',
            projectId,
            enteredBy: userId,
          });
        } else {
          return insertDailyEntrySchema.parse({
            ...entry,
            projectId,
            enteredBy: userId,
          });
        }
      });
      
      const entries = await storage.createDailyEntries(parsedEntries);
      res.status(201).json(entries);
    } catch (error) {
      console.error("Error bulk creating entries:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid entry data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create entries" });
    }
  });

  app.patch("/api/entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const entryId = req.params.id;
      const userId = req.user.claims.sub;
      
      const entry = await storage.getDailyEntry(entryId);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      if (!(await storage.canAccessProject(entry.projectId, userId))) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      const updated = await storage.updateDailyEntry(entryId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating entry:", error);
      res.status(500).json({ message: "Failed to update entry" });
    }
  });

  app.delete("/api/entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const entryId = req.params.id;
      const userId = req.user.claims.sub;
      
      const entry = await storage.getDailyEntry(entryId);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      if (!(await storage.canAccessProject(entry.projectId, userId))) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      await storage.deleteDailyEntry(entryId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting entry:", error);
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  app.get("/api/projects/:id/schedule", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const schedule = await storage.getMonthlySchedule(projectId);
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching schedule:", error);
      res.status(500).json({ message: "Failed to fetch schedule" });
    }
  });

  app.post("/api/projects/:id/schedule", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const parsed = insertMonthlyScheduleSchema.parse({
        ...req.body,
        projectId,
      });
      
      const schedule = await storage.upsertMonthlySchedule(parsed);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating schedule:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid schedule data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.get("/api/projects/:id/performance", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const { period, startDate, endDate } = req.query;
      
      const project = await storage.getProjectForUser(projectId, userId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      let entries;
      if (startDate && endDate) {
        entries = await storage.getDailyEntriesByDateRange(projectId, startDate as string, endDate as string);
      } else {
        entries = await storage.getDailyEntries(projectId);
      }
      
      const workItems = await storage.getWorkItems(projectId);
      const schedule = await storage.getMonthlySchedule(projectId);
      
      const workItemMap = new Map<string, { targetManHours: number }>();
      workItems.forEach((wi) => {
        workItemMap.set(String(wi.id), { targetManHours: wi.targetManHours || 0 });
      });
      
      const dailyData: Record<string, { manHours: number; quantity: number; earnedManHours: number }> = {};
      entries.forEach((entry) => {
        const date = entry.entryDate;
        if (!dailyData[date]) {
          dailyData[date] = { manHours: 0, quantity: 0, earnedManHours: 0 };
        }
        dailyData[date].manHours += entry.manHours || 0;
        dailyData[date].quantity += entry.quantity || 0;
        const wi = workItemMap.get(String(entry.workItemId));
        if (wi) {
          dailyData[date].earnedManHours += (entry.quantity || 0) * wi.targetManHours;
        }
      });
      
      const totalPlannedManHours = project.plannedManHours || 0;
      const totalPlannedConcrete = project.totalConcrete || 0;
      const totalSpentManHours = entries.reduce((sum, e) => sum + (e.manHours || 0), 0);
      const totalQuantity = entries.reduce((sum, e) => sum + (e.quantity || 0), 0);
      
      const performanceData = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          ...data,
        }));
      
      let cumulativeManHours = 0;
      let cumulativeQuantity = 0;
      let cumulativeEarnedManHours = 0;
      const cumulativeData = performanceData.map((item) => {
        cumulativeManHours += item.manHours;
        cumulativeQuantity += item.quantity;
        cumulativeEarnedManHours += item.earnedManHours;
        return {
          date: item.date,
          cumulativeManHours,
          cumulativeQuantity,
          cumulativeEarnedManHours,
          plannedManHours: totalPlannedManHours,
          plannedConcrete: totalPlannedConcrete,
        };
      });
      
      res.json({
        daily: performanceData,
        cumulative: cumulativeData,
        summary: {
          totalPlannedManHours,
          totalSpentManHours,
          manHoursProgress: totalPlannedManHours > 0 ? (totalSpentManHours / totalPlannedManHours) * 100 : 0,
          totalPlannedConcrete,
          totalQuantity,
          concreteProgress: totalPlannedConcrete > 0 ? (totalQuantity / totalPlannedConcrete) * 100 : 0,
        },
        workItems,
        schedule,
      });
    } catch (error) {
      console.error("Error fetching performance:", error);
      res.status(500).json({ message: "Failed to fetch performance data" });
    }
  });

  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const members = await storage.getProjectMembersWithUsers(projectId);
      const project = await storage.getProject(projectId);
      
      res.json({
        members,
        createdBy: project?.createdBy,
        isAdmin: await storage.isProjectAdmin(projectId, userId),
      });
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post("/api/projects/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.isProjectAdmin(projectId, userId))) {
        return res.status(403).json({ message: "Only project admins can add members" });
      }
      
      const parsed = insertProjectMemberSchema.parse({
        ...req.body,
        projectId,
      });
      
      const existingMembers = await storage.getProjectMembers(projectId);
      const alreadyMember = existingMembers.find(m => m.userId === parsed.userId);
      if (alreadyMember) {
        return res.status(400).json({ message: "User is already a member of this project" });
      }
      
      const member = await storage.addProjectMember(parsed);
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding project member:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid member data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add project member" });
    }
  });

  app.patch("/api/projects/:id/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const memberUserId = req.params.memberId;
      const userId = req.user.claims.sub;
      const { role } = req.body;
      
      if (!(await storage.isProjectAdmin(projectId, userId))) {
        return res.status(403).json({ message: "Only project admins can update member roles" });
      }
      
      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      if (role !== "admin") {
        const members = await storage.getProjectMembers(projectId);
        const targetMember = members.find(m => m.userId === memberUserId);
        
        if (targetMember?.role === "admin") {
          const adminCount = members.filter(m => m.role === "admin").length;
          if (adminCount <= 1) {
            return res.status(400).json({ message: "Cannot demote the only admin" });
          }
        }
      }
      
      const updated = await storage.updateProjectMemberRole(projectId, memberUserId, role);
      if (!updated) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({ message: "Failed to update member role" });
    }
  });

  app.delete("/api/projects/:id/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const memberUserId = req.params.memberId;
      const userId = req.user.claims.sub;
      
      if (!(await storage.isProjectAdmin(projectId, userId))) {
        return res.status(403).json({ message: "Only project admins can remove members" });
      }
      
      const members = await storage.getProjectMembers(projectId);
      const memberToRemove = members.find(m => m.userId === memberUserId);
      
      if (memberToRemove?.role === "admin") {
        const adminCount = members.filter(m => m.role === "admin").length;
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot remove the only admin" });
        }
      }
      
      await storage.removeProjectMember(projectId, memberUserId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing project member:", error);
      res.status(500).json({ message: "Failed to remove project member" });
    }
  });

  // Project Invitations
  app.get("/api/projects/:id/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.canAccessProject(projectId, userId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const invitations = await storage.getProjectInvitations(projectId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.post("/api/projects/:id/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      
      if (!(await storage.isProjectAdmin(projectId, userId))) {
        return res.status(403).json({ message: "Only project admins can create invitations" });
      }
      
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry
      
      const parsed = insertProjectInvitationSchema.parse({
        ...req.body,
        projectId,
        token,
        expiresAt,
        createdBy: userId,
        status: "pending",
      });
      
      const invitation = await storage.createProjectInvitation(parsed);
      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid invitation data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  app.delete("/api/projects/:id/invitations/:invitationId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const invitationId = req.params.invitationId;
      const userId = req.user.claims.sub;
      
      if (!(await storage.isProjectAdmin(projectId, userId))) {
        return res.status(403).json({ message: "Only project admins can delete invitations" });
      }
      
      await storage.deleteProjectInvitation(invitationId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ message: "Failed to delete invitation" });
    }
  });

  // Public invitation acceptance endpoint (no auth required initially to get info)
  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const token = req.params.token;
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Davet bulunamadı" });
      }
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Bu davet zaten kullanılmış" });
      }
      
      if (new Date() > new Date(invitation.expiresAt)) {
        await storage.updateInvitationStatus(invitation.id, "expired");
        return res.status(400).json({ message: "Davet süresi dolmuş" });
      }
      
      const project = await storage.getProject(invitation.projectId);
      res.json({
        invitation,
        projectName: project?.name,
      });
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  // Accept invitation (requires auth)
  app.post("/api/invitations/:token/accept", isAuthenticated, async (req: any, res) => {
    try {
      const token = req.params.token;
      const userId = req.user.claims.sub;
      
      const invitation = await storage.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Davet bulunamadı" });
      }
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Bu davet zaten kullanılmış" });
      }
      
      if (new Date() > new Date(invitation.expiresAt)) {
        await storage.updateInvitationStatus(invitation.id, "expired");
        return res.status(400).json({ message: "Davet süresi dolmuş" });
      }
      
      // Check if user is already a member
      const existingMembers = await storage.getProjectMembers(invitation.projectId);
      const alreadyMember = existingMembers.find(m => m.userId === userId);
      
      if (alreadyMember) {
        await storage.updateInvitationStatus(invitation.id, "accepted");
        return res.status(400).json({ message: "Bu projeye zaten üyesiniz" });
      }
      
      // Add user as project member
      await storage.addProjectMember({
        projectId: invitation.projectId,
        userId,
        role: invitation.role,
      });
      
      // Mark invitation as accepted
      await storage.updateInvitationStatus(invitation.id, "accepted");
      
      res.json({ 
        message: "Projeye başarıyla katıldınız",
        projectId: invitation.projectId,
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Davet kabul edilemedi" });
    }
  });

  app.get("/api/projects/:id/reports", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      const project = await storage.getProjectForUser(projectId, userId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      let entries;
      if (startDate && endDate) {
        entries = await storage.getDailyEntriesByDateRange(projectId, startDate as string, endDate as string);
      } else {
        entries = await storage.getDailyEntries(projectId);
      }
      
      const workItems = await storage.getWorkItems(projectId);
      const schedule = await storage.getMonthlySchedule(projectId);
      const workSchedule = await storage.getMonthlyWorkItemSchedule(projectId);
      
      // Get work items by unit type for material breakdown
      const m3WorkItems = workItems.filter(w => w.unit === 'm3');
      const m3WorkItemIds = new Set(m3WorkItems.map(w => w.id));
      const m2WorkItemIds = new Set(workItems.filter(w => w.unit === 'm2').map(w => w.id));
      const tonWorkItemIds = new Set(workItems.filter(w => w.unit === 'ton').map(w => w.id));
      
      // Create a map from normalized work item name to work item ID for schedule matching
      const workItemNameToIdMap = new Map<string, string>();
      workItems.forEach(w => {
        workItemNameToIdMap.set(w.name.trim().toLowerCase(), w.id);
      });
      
      // Create a map of workItemId -> targetManHours (birim adam saat) for earned man-hours calculation
      const workItemUnitManHoursMap = new Map<string, number>();
      workItems.forEach(w => {
        workItemUnitManHoursMap.set(w.id, w.targetManHours || 0);
      });
      
      const dailyData: Record<string, { manHours: number; quantity: number; target: number; earnedManHours: number; concrete: number; formwork: number; rebar: number }> = {};
      entries.forEach((entry) => {
        const date = entry.entryDate;
        if (!dailyData[date]) {
          dailyData[date] = { manHours: 0, quantity: 0, target: 0, earnedManHours: 0, concrete: 0, formwork: 0, rebar: 0 };
        }
        dailyData[date].manHours += entry.manHours || 0;
        dailyData[date].quantity += entry.quantity || 0;
        // Material breakdown by unit type
        if (m3WorkItemIds.has(entry.workItemId)) {
          dailyData[date].concrete += entry.quantity || 0;
        }
        if (m2WorkItemIds.has(entry.workItemId)) {
          dailyData[date].formwork += entry.quantity || 0;
        }
        if (tonWorkItemIds.has(entry.workItemId)) {
          dailyData[date].rebar += entry.quantity || 0;
        }
        // Calculate earned man-hours: quantity × unit man-hours (birim adam saat)
        const unitManHours = workItemUnitManHoursMap.get(entry.workItemId) || 0;
        dailyData[date].earnedManHours += (entry.quantity || 0) * unitManHours;
      });
      
      const totalPlannedManHours = project.plannedManHours || 0;
      const totalDays = project.totalDuration || 1;
      const dailyTarget = totalPlannedManHours / totalDays;
      
      const daily = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          manHours: data.manHours,
          quantity: data.quantity,
          target: dailyTarget,
          earnedManHours: data.earnedManHours,
          concrete: data.concrete,
          formwork: data.formwork,
          rebar: data.rebar,
        }));
      
      // Get the last day's stats
      const lastDayStats = daily.length > 0 ? daily[daily.length - 1] : null;
      
      const weeklyData: Record<string, { manHours: number; quantity: number; target: number; earnedManHours: number; concrete: number; formwork: number; rebar: number }> = {};
      daily.forEach((item) => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + new Date(weekStart.getFullYear(), 0, 1).getDay()) / 7)).padStart(2, "0")}`;
        
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { manHours: 0, quantity: 0, target: 0, earnedManHours: 0, concrete: 0, formwork: 0, rebar: 0 };
        }
        weeklyData[weekKey].manHours += item.manHours;
        weeklyData[weekKey].quantity += item.quantity;
        weeklyData[weekKey].target += dailyTarget;
        weeklyData[weekKey].earnedManHours += item.earnedManHours;
        weeklyData[weekKey].concrete += item.concrete;
        weeklyData[weekKey].formwork += item.formwork;
        weeklyData[weekKey].rebar += item.rebar;
      });
      
      const weekly = Object.entries(weeklyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, data]) => ({
          week,
          manHours: data.manHours,
          quantity: data.quantity,
          target: data.target,
          earnedManHours: data.earnedManHours,
          concrete: data.concrete,
          formwork: data.formwork,
          rebar: data.rebar,
        }));
      
      // Get the last week's stats
      const lastWeekStats = weekly.length > 0 ? weekly[weekly.length - 1] : null;
      
      const monthlyData: Record<string, { manHours: number; quantity: number; target: number; earnedManHours: number }> = {};
      schedule.forEach((s) => {
        const monthKey = `${s.year}-${String(s.month).padStart(2, "0")}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { manHours: 0, quantity: 0, target: s.plannedManHours || 0, earnedManHours: 0 };
        } else {
          monthlyData[monthKey].target = s.plannedManHours || 0;
        }
      });
      
      daily.forEach((item) => {
        const monthKey = item.date.substring(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { manHours: 0, quantity: 0, target: 0, earnedManHours: 0 };
        }
        monthlyData[monthKey].manHours += item.manHours;
        monthlyData[monthKey].quantity += item.quantity;
        monthlyData[monthKey].earnedManHours += item.earnedManHours;
      });
      
      // Build monthly array with cumulative values
      let monthlyCumulativeManHours = 0;
      let monthlyCumulativeEarnedManHours = 0;
      const monthly = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => {
          monthlyCumulativeManHours += data.manHours;
          monthlyCumulativeEarnedManHours += data.earnedManHours;
          return {
            month,
            manHours: data.manHours,
            quantity: data.quantity,
            target: data.target,
            earnedManHours: data.earnedManHours,
            cumulativeManHours: monthlyCumulativeManHours,
            cumulativeEarnedManHours: monthlyCumulativeEarnedManHours,
          };
        });
      
      // Calculate monthly concrete performance (m3 work items only)
      const monthlyConcreteData: Record<string, { actual: number; planned: number }> = {};
      
      // Get actual concrete from daily entries (only m3 work items)
      entries.forEach((entry) => {
        if (m3WorkItemIds.has(entry.workItemId)) {
          const monthKey = entry.entryDate.substring(0, 7);
          if (!monthlyConcreteData[monthKey]) {
            monthlyConcreteData[monthKey] = { actual: 0, planned: 0 };
          }
          monthlyConcreteData[monthKey].actual += entry.quantity || 0;
        }
      });
      
      // Get planned concrete from work schedule
      // Match concrete work items by name: "Temel" and "Ustyapi" (Üstyapı)
      const concreteWorkItemNames = new Set(["temel", "ustyapi", "üstyapı", "ustyapı", "üstyapi"]);
      
      workSchedule.forEach((ws) => {
        const normalizedName = ws.workItemName.trim().toLowerCase()
          .replace(/ü/g, 'u').replace(/ı/g, 'i'); // Normalize Turkish chars
        
        // Check if this is a concrete work item (Temel or Ustyapi)
        const isConcreteItem = concreteWorkItemNames.has(normalizedName) ||
          normalizedName.includes("temel") || 
          normalizedName.includes("ustyapi") ||
          normalizedName.includes("üstyapı");
        
        if (isConcreteItem) {
          const monthKey = `${ws.year}-${String(ws.month).padStart(2, "0")}`;
          
          // Apply date filter if provided (using year/month comparison)
          if (startDate) {
            const filterYear = parseInt(startDate.substring(0, 4), 10);
            const filterMonth = parseInt(startDate.substring(5, 7), 10);
            if (ws.year < filterYear || (ws.year === filterYear && ws.month < filterMonth)) return;
          }
          if (endDate) {
            const filterYear = parseInt(endDate.substring(0, 4), 10);
            const filterMonth = parseInt(endDate.substring(5, 7), 10);
            if (ws.year > filterYear || (ws.year === filterYear && ws.month > filterMonth)) return;
          }
          
          if (!monthlyConcreteData[monthKey]) {
            monthlyConcreteData[monthKey] = { actual: 0, planned: 0 };
          }
          monthlyConcreteData[monthKey].planned += ws.plannedQuantity || 0;
        }
      });
      
      const monthlyConcrete = Object.entries(monthlyConcreteData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          actual: data.actual,
          planned: data.planned,
        }));
      
      let cumulativeManHours = 0;
      let cumulativeQuantity = 0;
      let cumulativeTarget = 0;
      const cumulative = daily.map((item) => {
        cumulativeManHours += item.manHours;
        cumulativeQuantity += item.quantity;
        cumulativeTarget += dailyTarget;
        return {
          date: item.date,
          cumulativeManHours,
          cumulativeQuantity,
          cumulativeTarget,
        };
      });
      
      const workItemStats = workItems.map((wi) => {
        const wiEntries = entries.filter((e) => e.workItemId === wi.id);
        const totalManHours = wiEntries.reduce((sum, e) => sum + (e.manHours || 0), 0);
        const totalQuantity = wiEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
        // Earned man-hours = total quantity × unit man-hours (birim adam saat)
        const earnedManHours = totalQuantity * (wi.targetManHours || 0);
        return {
          id: wi.id,
          budgetCode: wi.budgetCode,
          name: wi.name,
          unit: wi.unit,
          targetQuantity: wi.targetQuantity || 0,
          targetManHours: wi.targetManHours || 0,
          actualQuantity: totalQuantity,
          actualManHours: totalManHours,
          earnedManHours: earnedManHours,
          progressPercent: (wi.targetQuantity || 0) > 0 ? (totalQuantity / (wi.targetQuantity || 1)) * 100 : 0,
        };
      });
      
      // Calculate total earned man-hours
      const totalEarnedManHours = workItemStats.reduce((sum, wi) => sum + wi.earnedManHours, 0);
      
      res.json({
        daily,
        weekly,
        monthly,
        monthlyConcrete,
        cumulative,
        workItems: workItemStats,
        lastDayStats,
        lastWeekStats,
        summary: {
          totalPlannedManHours: project.plannedManHours || 0,
          totalSpentManHours: entries.reduce((sum, e) => sum + (e.manHours || 0), 0),
          totalEarnedManHours: totalEarnedManHours,
          totalPlannedConcrete: project.totalConcrete || 0,
          totalQuantity: entries.reduce((sum, e) => sum + (e.quantity || 0), 0),
        },
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Weather API endpoint using Open-Meteo (free, no API key required)
  app.get("/api/weather/:location", isAuthenticated, async (req: any, res) => {
    try {
      const location = decodeURIComponent(req.params.location);
      
      // First, geocode the location using Open-Meteo's geocoding API
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=tr&format=json`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();
      
      if (!geocodeData.results || geocodeData.results.length === 0) {
        return res.status(404).json({ message: "Lokasyon bulunamadı" });
      }
      
      const { latitude, longitude, name, country } = geocodeData.results[0];
      
      // Now fetch weather data
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&current=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=8`;
      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();
      
      // Map weather codes to Turkish descriptions and icons
      const getWeatherInfo = (code: number) => {
        const weatherCodes: Record<number, { description: string; icon: string }> = {
          0: { description: "Açık", icon: "sun" },
          1: { description: "Az bulutlu", icon: "cloud-sun" },
          2: { description: "Parçalı bulutlu", icon: "cloud-sun" },
          3: { description: "Bulutlu", icon: "cloud" },
          45: { description: "Sisli", icon: "cloud-fog" },
          48: { description: "Yoğun sis", icon: "cloud-fog" },
          51: { description: "Hafif çisenti", icon: "cloud-drizzle" },
          53: { description: "Çisenti", icon: "cloud-drizzle" },
          55: { description: "Yoğun çisenti", icon: "cloud-drizzle" },
          56: { description: "Dondurucu çisenti", icon: "cloud-drizzle" },
          57: { description: "Yoğun dondurucu çisenti", icon: "cloud-drizzle" },
          61: { description: "Hafif yağmur", icon: "cloud-rain" },
          63: { description: "Yağmurlu", icon: "cloud-rain" },
          65: { description: "Şiddetli yağmur", icon: "cloud-rain" },
          66: { description: "Dondurucu yağmur", icon: "cloud-rain" },
          67: { description: "Yoğun dondurucu yağmur", icon: "cloud-rain" },
          71: { description: "Hafif kar", icon: "snowflake" },
          73: { description: "Kar yağışlı", icon: "snowflake" },
          75: { description: "Yoğun kar", icon: "snowflake" },
          77: { description: "Kar taneleri", icon: "snowflake" },
          80: { description: "Hafif sağanak", icon: "cloud-rain" },
          81: { description: "Sağanak yağış", icon: "cloud-rain" },
          82: { description: "Şiddetli sağanak", icon: "cloud-rain" },
          85: { description: "Hafif kar sağanağı", icon: "snowflake" },
          86: { description: "Kar sağanağı", icon: "snowflake" },
          95: { description: "Gök gürültülü fırtına", icon: "cloud-lightning" },
          96: { description: "Dolu ile fırtına", icon: "cloud-lightning" },
          99: { description: "Şiddetli dolu fırtınası", icon: "cloud-lightning" },
        };
        return weatherCodes[code] || { description: "Bilinmiyor", icon: "cloud" };
      };
      
      const currentWeather = getWeatherInfo(weatherData.current.weather_code);
      
      // Build 7-day forecast (skip today, take next 7 days)
      const forecast = [];
      for (let i = 1; i <= 7; i++) {
        const date = weatherData.daily.time[i];
        const weatherInfo = getWeatherInfo(weatherData.daily.weather_code[i]);
        forecast.push({
          date,
          tempMax: Math.round(weatherData.daily.temperature_2m_max[i]),
          tempMin: Math.round(weatherData.daily.temperature_2m_min[i]),
          precipitation: weatherData.daily.precipitation_sum[i],
          precipitationProbability: weatherData.daily.precipitation_probability_max[i],
          description: weatherInfo.description,
          icon: weatherInfo.icon,
        });
      }
      
      res.json({
        location: {
          name,
          country,
          latitude,
          longitude,
        },
        current: {
          temperature: Math.round(weatherData.current.temperature_2m),
          description: currentWeather.description,
          icon: currentWeather.icon,
          isDay: weatherData.current.is_day === 1,
        },
        today: {
          tempMax: Math.round(weatherData.daily.temperature_2m_max[0]),
          tempMin: Math.round(weatherData.daily.temperature_2m_min[0]),
          precipitation: weatherData.daily.precipitation_sum[0],
          precipitationProbability: weatherData.daily.precipitation_probability_max[0],
          description: getWeatherInfo(weatherData.daily.weather_code[0]).description,
          icon: getWeatherInfo(weatherData.daily.weather_code[0]).icon,
        },
        forecast,
      });
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ message: "Hava durumu bilgisi alınamadı" });
    }
  });

  return httpServer;
}
