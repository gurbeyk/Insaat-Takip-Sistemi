import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertProjectSchema,
  insertWorkItemSchema,
  insertDailyEntrySchema,
  insertMonthlyScheduleSchema,
  insertProjectMemberSchema,
} from "@shared/schema";
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
      
      const dailyData: Record<string, { manHours: number; quantity: number }> = {};
      entries.forEach((entry) => {
        const date = entry.entryDate;
        if (!dailyData[date]) {
          dailyData[date] = { manHours: 0, quantity: 0 };
        }
        dailyData[date].manHours += entry.manHours || 0;
        dailyData[date].quantity += entry.quantity || 0;
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
      const cumulativeData = performanceData.map((item) => {
        cumulativeManHours += item.manHours;
        cumulativeQuantity += item.quantity;
        return {
          date: item.date,
          cumulativeManHours,
          cumulativeQuantity,
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
      
      const dailyData: Record<string, { manHours: number; quantity: number; target: number }> = {};
      entries.forEach((entry) => {
        const date = entry.entryDate;
        if (!dailyData[date]) {
          dailyData[date] = { manHours: 0, quantity: 0, target: 0 };
        }
        dailyData[date].manHours += entry.manHours || 0;
        dailyData[date].quantity += entry.quantity || 0;
      });
      
      const totalPlannedManHours = project.plannedManHours || 0;
      const totalDays = project.duration || 1;
      const dailyTarget = totalPlannedManHours / totalDays;
      
      const daily = Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          manHours: data.manHours,
          quantity: data.quantity,
          target: dailyTarget,
        }));
      
      const weeklyData: Record<string, { manHours: number; quantity: number; target: number }> = {};
      daily.forEach((item) => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay() + 1);
        const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + new Date(weekStart.getFullYear(), 0, 1).getDay()) / 7)).padStart(2, "0")}`;
        
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { manHours: 0, quantity: 0, target: 0 };
        }
        weeklyData[weekKey].manHours += item.manHours;
        weeklyData[weekKey].quantity += item.quantity;
        weeklyData[weekKey].target += dailyTarget;
      });
      
      const weekly = Object.entries(weeklyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, data]) => ({
          week,
          manHours: data.manHours,
          quantity: data.quantity,
          target: data.target,
        }));
      
      const monthlyData: Record<string, { manHours: number; quantity: number; target: number }> = {};
      schedule.forEach((s) => {
        const monthKey = `${s.year}-${String(s.month).padStart(2, "0")}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { manHours: 0, quantity: 0, target: s.plannedManHours || 0 };
        } else {
          monthlyData[monthKey].target = s.plannedManHours || 0;
        }
      });
      
      daily.forEach((item) => {
        const monthKey = item.date.substring(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { manHours: 0, quantity: 0, target: 0 };
        }
        monthlyData[monthKey].manHours += item.manHours;
        monthlyData[monthKey].quantity += item.quantity;
      });
      
      const monthly = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          manHours: data.manHours,
          quantity: data.quantity,
          target: data.target,
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
        return {
          id: wi.id,
          budgetCode: wi.budgetCode,
          name: wi.name,
          unit: wi.unit,
          targetQuantity: wi.targetQuantity || 0,
          targetManHours: wi.targetManHours || 0,
          actualQuantity: totalQuantity,
          actualManHours: totalManHours,
          progressPercent: (wi.targetQuantity || 0) > 0 ? (totalQuantity / (wi.targetQuantity || 1)) * 100 : 0,
        };
      });
      
      res.json({
        daily,
        weekly,
        monthly,
        cumulative,
        workItems: workItemStats,
        summary: {
          totalPlannedManHours: project.plannedManHours || 0,
          totalSpentManHours: entries.reduce((sum, e) => sum + (e.manHours || 0), 0),
          totalPlannedConcrete: project.totalConcrete || 0,
          totalQuantity: entries.reduce((sum, e) => sum + (e.quantity || 0), 0),
        },
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  return httpServer;
}
