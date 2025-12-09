import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { BarChart3, TrendingUp, Users, Layers, AlertCircle } from "lucide-react";
import type { Project, WorkItem, DailyEntry } from "@shared/schema";

interface ProjectWithStats extends Project {
  workItems: WorkItem[];
  dailyEntries: DailyEntry[];
  totalActualManHours: number;
  totalActualQuantity: number;
  manHoursProgress: number;
  quantityProgress: number;
}

export default function ProjectComparison() {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [comparisonMetric, setComparisonMetric] = useState<"manhours" | "quantity" | "progress">("progress");

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectQueries = useQuery<ProjectWithStats[]>({
    queryKey: ["/api/projects/comparison", selectedProjectIds],
    enabled: selectedProjectIds.length >= 2,
    queryFn: async () => {
      const results = await Promise.all(
        selectedProjectIds.map(async (id) => {
          const [projectRes, workItemsRes, entriesRes] = await Promise.all([
            apiRequest("GET", `/api/projects/${id}`),
            apiRequest("GET", `/api/projects/${id}/work-items`),
            apiRequest("GET", `/api/projects/${id}/entries`),
          ]);
          
          const project = await projectRes.json() as Project;
          const workItems = await workItemsRes.json() as WorkItem[];
          const dailyEntries = await entriesRes.json() as DailyEntry[];

          const totalActualManHours = dailyEntries.reduce((sum, e) => sum + (e.manHours || 0), 0);
          const totalActualQuantity = dailyEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
          const totalTargetQuantity = workItems.reduce((sum, w) => sum + (w.targetQuantity || 0), 0);
          
          const manHoursProgress = project.plannedManHours > 0 
            ? (totalActualManHours / project.plannedManHours) * 100 
            : 0;
          const quantityProgress = totalTargetQuantity > 0 
            ? (totalActualQuantity / totalTargetQuantity) * 100 
            : 0;

          return {
            ...project,
            workItems,
            dailyEntries,
            totalActualManHours,
            totalActualQuantity,
            manHoursProgress,
            quantityProgress,
          };
        })
      );
      return results;
    },
  });

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const barChartData = useMemo(() => {
    if (!projectQueries.data) return [];
    
    return projectQueries.data.map((p) => ({
      name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name,
      fullName: p.name,
      "Adam-Saat (Planlanan)": p.plannedManHours,
      "Adam-Saat (Gerçekleşen)": p.totalActualManHours,
      "Metraj İlerleme %": Math.round(p.quantityProgress),
      "Adam-Saat İlerleme %": Math.round(p.manHoursProgress),
    }));
  }, [projectQueries.data]);

  const radarData = useMemo(() => {
    if (!projectQueries.data) return [];
    
    const metrics = [
      { metric: "Adam-Saat İlerleme", key: "manHoursProgress" },
      { metric: "Metraj İlerleme", key: "quantityProgress" },
      { metric: "İş Kalemi Sayısı", key: "workItemCount" },
      { metric: "Giriş Sayısı", key: "entryCount" },
    ];

    return metrics.map((m) => {
      const dataPoint: Record<string, number | string> = { metric: m.metric };
      projectQueries.data.forEach((p) => {
        if (m.key === "manHoursProgress") {
          dataPoint[p.name] = Math.min(p.manHoursProgress, 100);
        } else if (m.key === "quantityProgress") {
          dataPoint[p.name] = Math.min(p.quantityProgress, 100);
        } else if (m.key === "workItemCount") {
          const maxItems = Math.max(...projectQueries.data.map(pr => pr.workItems.length), 1);
          dataPoint[p.name] = (p.workItems.length / maxItems) * 100;
        } else if (m.key === "entryCount") {
          const maxEntries = Math.max(...projectQueries.data.map(pr => pr.dailyEntries.length), 1);
          dataPoint[p.name] = (p.dailyEntries.length / maxEntries) * 100;
        }
      });
      return dataPoint;
    });
  }, [projectQueries.data]);

  const projectColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  if (projectsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Proje Karşılaştırma
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Projeleri yan yana karşılaştırın ve performans analizleri yapın
          </p>
        </div>
        
        <Select
          value={comparisonMetric}
          onValueChange={(value) => setComparisonMetric(value as "manhours" | "quantity" | "progress")}
        >
          <SelectTrigger className="w-48" data-testid="select-metric">
            <SelectValue placeholder="Metrik Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="progress">İlerleme Oranları</SelectItem>
            <SelectItem value="manhours">Adam-Saat</SelectItem>
            <SelectItem value="quantity">Metraj</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Karşılaştırılacak Projeleri Seçin (en az 2)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!projects || projects.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Henüz proje eklenmedi</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 p-2 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => toggleProject(project.id)}
                  data-testid={`checkbox-project-${project.id}`}
                >
                  <Checkbox
                    checked={selectedProjectIds.includes(project.id)}
                    onCheckedChange={() => toggleProject(project.id)}
                    data-testid={`input-checkbox-${project.id}`}
                  />
                  <span className="text-sm">{project.name}</span>
                  <Badge
                    variant={
                      project.status === "active"
                        ? "default"
                        : project.status === "completed"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {project.status === "active"
                      ? "Aktif"
                      : project.status === "completed"
                      ? "Tamamlandı"
                      : "Beklemede"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          
          {selectedProjectIds.length > 0 && selectedProjectIds.length < 2 && (
            <p className="text-sm text-muted-foreground mt-3">
              Karşılaştırma için en az 2 proje seçin
            </p>
          )}
        </CardContent>
      </Card>

      {selectedProjectIds.length >= 2 && (
        <>
          {projectQueries.isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          ) : projectQueries.data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {projectQueries.data.map((project, idx) => (
                  <Card key={project.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: projectColors[idx % projectColors.length] }}
                        />
                        {project.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Adam-Saat İlerleme</span>
                        <Badge variant={project.manHoursProgress > 100 ? "destructive" : "secondary"}>
                          %{Math.round(project.manHoursProgress)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Metraj İlerleme</span>
                        <Badge variant="secondary">%{Math.round(project.quantityProgress)}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">İş Kalemleri</span>
                        <span>{project.workItems.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Günlük Girişler</span>
                        <span>{project.dailyEntries.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      {comparisonMetric === "manhours"
                        ? "Adam-Saat Karşılaştırması"
                        : comparisonMetric === "quantity"
                        ? "Metraj Karşılaştırması"
                        : "İlerleme Oranları"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={barChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Legend />
                        {comparisonMetric === "manhours" ? (
                          <>
                            <Bar dataKey="Adam-Saat (Planlanan)" fill="hsl(var(--chart-1))" />
                            <Bar dataKey="Adam-Saat (Gerçekleşen)" fill="hsl(var(--chart-2))" />
                          </>
                        ) : comparisonMetric === "progress" ? (
                          <>
                            <Bar dataKey="Adam-Saat İlerleme %" fill="hsl(var(--chart-1))" />
                            <Bar dataKey="Metraj İlerleme %" fill="hsl(var(--chart-2))" />
                          </>
                        ) : (
                          <Bar dataKey="Metraj İlerleme %" fill="hsl(var(--chart-3))" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Performans Radar Grafiği
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid className="stroke-muted" />
                        <PolarAngleAxis dataKey="metric" className="text-xs" />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs" />
                        {projectQueries.data.map((project, idx) => (
                          <Radar
                            key={project.id}
                            name={project.name}
                            dataKey={project.name}
                            stroke={projectColors[idx % projectColors.length]}
                            fill={projectColors[idx % projectColors.length]}
                            fillOpacity={0.2}
                          />
                        ))}
                        <Legend />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                          }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Detaylı Karşılaştırma Tablosu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Proje</th>
                          <th className="text-right p-2 font-medium">Planlanan Adam-Saat</th>
                          <th className="text-right p-2 font-medium">Gerçekleşen Adam-Saat</th>
                          <th className="text-right p-2 font-medium">Adam-Saat %</th>
                          <th className="text-right p-2 font-medium">Metraj %</th>
                          <th className="text-right p-2 font-medium">İş Kalemleri</th>
                          <th className="text-right p-2 font-medium">Girişler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectQueries.data.map((project, idx) => (
                          <tr key={project.id} className="border-b last:border-0">
                            <td className="p-2 flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: projectColors[idx % projectColors.length] }}
                              />
                              {project.name}
                            </td>
                            <td className="text-right p-2">{project.plannedManHours.toLocaleString("tr-TR")}</td>
                            <td className="text-right p-2">{project.totalActualManHours.toLocaleString("tr-TR")}</td>
                            <td className="text-right p-2">
                              <Badge variant={project.manHoursProgress > 100 ? "destructive" : "outline"}>
                                %{Math.round(project.manHoursProgress)}
                              </Badge>
                            </td>
                            <td className="text-right p-2">
                              <Badge variant="outline">%{Math.round(project.quantityProgress)}</Badge>
                            </td>
                            <td className="text-right p-2">{project.workItems.length}</td>
                            <td className="text-right p-2">{project.dailyEntries.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}

      {selectedProjectIds.length < 2 && projects && projects.length >= 2 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Karşılaştırma için proje seçin</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Yukarıdan en az 2 proje seçerek performans karşılaştırması yapabilirsiniz.
              Grafikler ve tablolar seçiminize göre güncellenecektir.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
