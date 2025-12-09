import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Plus,
  Clock,
  Users,
  Building2,
  TrendingUp,
  Calendar,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import type { Project } from "@shared/schema";

interface ProjectWithStats extends Project {
  spentManHours: number;
  pouredConcrete: number;
  elapsedDays: number;
}

export default function Home() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: projects, isLoading, error, refetch } = useQuery<ProjectWithStats[]>({
    queryKey: ["/api/projects/with-stats"],
  });

  const calculateProgress = (spent: number, planned: number) => {
    if (planned === 0) return 0;
    return Math.min((spent / planned) * 100, 100);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Aktif</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Tamamlandı</Badge>;
      case "paused":
        return <Badge variant="default" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Beklemede</Badge>;
      default:
        return null;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return "bg-orange-500";
    if (percentage < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Proje Özeti</h1>
          <p className="text-muted-foreground mt-1">
            Tüm projelerinizin genel durumunu görüntüleyin
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-project">
          <Plus className="h-4 w-4 mr-2" />
          Yeni Proje Oluştur
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Hata</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <span>Projeler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="w-fit" data-testid="button-retry-projects">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </AlertDescription>
        </Alert>
      ) : projects && projects.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{projects.length}</p>
                    <p className="text-sm text-muted-foreground">Toplam Proje</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-green-500/10">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {projects.filter((p) => p.status === "active").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Aktif Proje</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {projects.reduce((sum, p) => sum + (p.spentManHours || 0), 0).toLocaleString("tr-TR")}
                    </p>
                    <p className="text-sm text-muted-foreground">Toplam Adam-Saat</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-orange-500/10">
                    <Clock className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {Math.round(
                        projects.reduce(
                          (sum, p) =>
                            sum +
                            calculateProgress(p.spentManHours || 0, p.plannedManHours || 0),
                          0
                        ) / projects.length
                      )}%
                    </p>
                    <p className="text-sm text-muted-foreground">Ort. İlerleme</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const manHoursProgress = calculateProgress(
                project.spentManHours || 0,
                project.plannedManHours || 0
              );
              const concreteProgress = calculateProgress(
                project.pouredConcrete || 0,
                project.totalConcrete || 0
              );
              const timeProgress = calculateProgress(
                project.elapsedDays || 0,
                project.totalDuration || 0
              );

              return (
                <Card key={project.id} className="group hover-elevate">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg font-semibold truncate">
                        {project.name}
                      </CardTitle>
                      {getStatusBadge(project.status)}
                    </div>
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {project.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            Adam-Saat
                          </span>
                          <span className="font-medium">
                            {(project.spentManHours || 0).toLocaleString("tr-TR")} /{" "}
                            {(project.plannedManHours || 0).toLocaleString("tr-TR")}
                          </span>
                        </div>
                        <Progress
                          value={manHoursProgress}
                          className={`h-2 ${getProgressColor(manHoursProgress)}`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            Beton (m³)
                          </span>
                          <span className="font-medium">
                            {(project.pouredConcrete || 0).toLocaleString("tr-TR")} /{" "}
                            {(project.totalConcrete || 0).toLocaleString("tr-TR")}
                          </span>
                        </div>
                        <Progress
                          value={concreteProgress}
                          className={`h-2 ${getProgressColor(concreteProgress)}`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Süre (Gün)
                          </span>
                          <span className="font-medium">
                            {project.elapsedDays || 0} / {project.totalDuration || 0}
                          </span>
                        </div>
                        <Progress
                          value={timeProgress}
                          className={`h-2 ${getProgressColor(timeProgress)}`}
                        />
                      </div>
                    </div>

                    <Link href={`/projects/${project.id}`}>
                      <Button
                        variant="ghost"
                        className="w-full justify-between group-hover:bg-accent"
                        data-testid={`button-view-project-${project.id}`}
                      >
                        Detayları Gör
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Henüz Proje Yok</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              İlk projenizi oluşturarak adam-saat ve metraj verilerinizi takip etmeye başlayın.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-project">
              <Plus className="h-4 w-4 mr-2" />
              İlk Projeyi Oluştur
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateProjectDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
