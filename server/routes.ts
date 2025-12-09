import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertProjectSchema,
  insertWorkItemSchema,
  insertDailyEntrySchema,
  insertMonthlyScheduleSchema,
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
          const spentManHours = entries.reduce((sum, e) => sum + (e.manHours || 0), 0);
          const pouredConcrete = entries.reduce((sum, e) => sum + (e.quantity || 0), 0);
          
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
      
      const spentManHours = dailyEntries.reduce((sum, e) => sum + (e.manHours || 0), 0);
      const pouredConcrete = dailyEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
      
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
      const parsed = insertProjectSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      const project = await storage.createProject(parsed);
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
      
      const updated = await storage.updateProject(projectId, req.body);
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
      
      res.json(entries);
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
      
      const parsedEntries = items.map((entry) =>
        insertDailyEntrySchema.parse({
          ...entry,
          projectId,
          enteredBy: userId,
        })
      );
      
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

  return httpServer;
}
