import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Users,
  Building2,
  Calendar,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
  CloudDrizzle,
  CloudSun,
  Snowflake,
  MapPin,
  Thermometer,
} from "lucide-react";
import { DataEntryTab } from "@/components/DataEntryTab";
import { ReportsTab } from "@/components/ReportsTab";
import { ProjectSettingsTab } from "@/components/ProjectSettingsTab";
import { TeamTab } from "@/components/TeamTab";
import type { Project, WorkItem, DailyEntry } from "@shared/schema";

interface ProjectWithDetails extends Project {
  spentManHours: number;
  pouredConcrete: number;
  elapsedDays: number;
  workItems: WorkItem[];
  dailyEntries: DailyEntry[];
}

interface WeatherData {
  location: {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  current: {
    temperature: number;
    description: string;
    icon: string;
    isDay: boolean;
  };
  today: {
    tempMax: number;
    tempMin: number;
    precipitation: number;
    precipitationProbability: number;
    description: string;
    icon: string;
  };
  forecast: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    precipitation: number;
    precipitationProbability: number;
    description: string;
    icon: string;
  }>;
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading, error, refetch } = useQuery<ProjectWithDetails>({
    queryKey: [`/api/projects/${params.id}`],
    enabled: !!params.id,
  });

  const { data: weather, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ['/api/weather', project?.location],
    queryFn: async () => {
      if (!project?.location) return null;
      const response = await fetch(`/api/weather/${encodeURIComponent(project.location)}`);
      if (!response.ok) throw new Error('Weather fetch failed');
      return response.json();
    },
    enabled: !!project?.location,
    staleTime: 1000 * 60 * 30, // 30 minutes cache
  });

  const calculateProgress = (spent: number, planned: number) => {
    if (planned === 0) return 0;
    return Math.min((spent / planned) * 100, 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage < 50) return "bg-orange-500";
    if (percentage < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Aktif</Badge>;
      case "completed":
        return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Tamamlandı</Badge>;
      case "paused":
        return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Beklemede</Badge>;
      default:
        return null;
    }
  };

  const getWeatherIcon = (icon: string, size: string = "h-8 w-8") => {
    const iconProps = { className: `${size} text-primary` };
    switch (icon) {
      case "sun":
        return <Sun {...iconProps} className={`${size} text-yellow-500`} />;
      case "cloud-sun":
        return <CloudSun {...iconProps} className={`${size} text-yellow-400`} />;
      case "cloud":
        return <Cloud {...iconProps} className={`${size} text-gray-400`} />;
      case "cloud-fog":
        return <CloudFog {...iconProps} className={`${size} text-gray-500`} />;
      case "cloud-drizzle":
        return <CloudDrizzle {...iconProps} className={`${size} text-blue-400`} />;
      case "cloud-rain":
        return <CloudRain {...iconProps} className={`${size} text-blue-500`} />;
      case "snowflake":
        return <Snowflake {...iconProps} className={`${size} text-blue-300`} />;
      case "cloud-lightning":
        return <CloudLightning {...iconProps} className={`${size} text-yellow-600`} />;
      default:
        return <Cloud {...iconProps} className={`${size} text-gray-400`} />;
    }
  };

  const formatTurkishDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
    };
  };

  // Calculate current month's statistics - must be before any early returns
  const currentMonthStats = useMemo(() => {
    if (!project) {
      return {
        monthName: "",
        year: 0,
        spentMH: 0,
        pouredConcrete: 0,
        progressMH: 0,
        earnedMH: 0,
        efficiency: 0,
      };
    }
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    
    // Create a map of workItemId -> targetManHours (birim adam saat)
    const workItemUnitManHours = new Map<string, number>();
    const workItemUnits = new Map<string, string>();
    project.workItems?.forEach((item) => {
      workItemUnitManHours.set(item.id, item.targetManHours || 0);
      workItemUnits.set(item.id, item.unit || "");
    });
    
    let monthlySpentMH = 0;
    let monthlyPouredConcrete = 0;
    let monthlyEarnedMH = 0;
    
    project.dailyEntries?.forEach((entry) => {
      const entryDate = new Date(entry.entryDate);
      if (entryDate.getFullYear() === currentYear && entryDate.getMonth() === currentMonth) {
        monthlySpentMH += entry.manHours || 0;
        
        // Poured concrete - check if unit is m3
        const unit = workItemUnits.get(entry.workItemId) || "";
        if (unit === "m3") {
          monthlyPouredConcrete += entry.quantity || 0;
        }
        
        // Earned man-hours: quantity × unit man-hours
        const unitMH = workItemUnitManHours.get(entry.workItemId) || 0;
        monthlyEarnedMH += (entry.quantity || 0) * unitMH;
      }
    });
    
    // İlerleme MH = harcanan / dökülen beton
    const progressMH = monthlyPouredConcrete > 0 ? monthlySpentMH / monthlyPouredConcrete : 0;
    
    // Verimlilik % = kazanılan / gerçekleşen × 100
    const efficiency = monthlySpentMH > 0 ? (monthlyEarnedMH / monthlySpentMH) * 100 : 0;
    
    // Get Turkish month name
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
                        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const monthName = monthNames[currentMonth];
    
    return {
      monthName,
      year: currentYear,
      spentMH: monthlySpentMH,
      pouredConcrete: monthlyPouredConcrete,
      progressMH,
      earnedMH: monthlyEarnedMH,
      efficiency,
    };
  }, [project]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Hata</AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <span>Proje yüklenirken bir hata oluştu. Lütfen tekrar deneyin.</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tekrar Dene
              </Button>
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Ana Sayfaya Dön
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold mb-2">Proje Bulunamadı</h3>
            <p className="text-muted-foreground mb-4">
              Aradığınız proje mevcut değil veya silinmiş olabilir.
            </p>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Ana Sayfaya Dön
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  // Format today's date in Turkish
  const todayFormatted = (() => {
    const now = new Date();
    const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${days[now.getDay()]}`;
  })();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-1 line-clamp-1">{project.description}</p>
          )}
        </div>
      </div>

      {/* Stats and Weather Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left side - Stats */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold truncate">
                  {(project.spentManHours || 0).toLocaleString("tr-TR")}
                </p>
                <p className="text-sm text-muted-foreground">Harcanan Adam-Saat</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>İlerleme</span>
                <span>{Math.round(manHoursProgress)}%</span>
              </div>
              <Progress value={manHoursProgress} className={`h-1.5 ${getProgressColor(manHoursProgress)}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold truncate">
                  {(project.pouredConcrete || 0).toLocaleString("tr-TR")}
                </p>
                <p className="text-sm text-muted-foreground">Dökülen Beton (m³)</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>İlerleme</span>
                <span>{Math.round(concreteProgress)}%</span>
              </div>
              <Progress value={concreteProgress} className={`h-1.5 ${getProgressColor(concreteProgress)}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-orange-500/10">
                <Calendar className="h-6 w-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold truncate">
                  {project.elapsedDays || 0}
                </p>
                <p className="text-sm text-muted-foreground">Geçen Gün</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Süre</span>
                <span>{project.totalDuration || 0} gün</span>
              </div>
              <Progress value={timeProgress} className={`h-1.5 ${getProgressColor(timeProgress)}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold truncate">
                  {project.pouredConcrete && project.pouredConcrete > 0
                    ? ((project.spentManHours || 0) / project.pouredConcrete).toFixed(2)
                    : "-"}
                </p>
                <p className="text-sm text-muted-foreground">İlerleme Birim A-S</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Kayıt</span>
                <span>{project.dailyEntries?.length || 0} giriş</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category-based Statistics */}
      {(() => {
        // Calculate category stats from workItems and dailyEntries
        const categories = ['Temel', 'Ustyapi', 'Grobeton'];
        const categoryStats: Record<string, { totalM3: number; spentMH: number; earnedMH: number; unitMH: number; efficiency: number }> = {};
        
        const workItemMap = new Map(project.workItems?.map(w => [w.id, w]) || []);
        
        for (const category of categories) {
          const categoryM3WorkItems = project.workItems?.filter(w => w.category === category && w.unit === 'm3') || [];
          const categoryM3WorkItemIds = new Set(categoryM3WorkItems.map(w => w.id));
          const categoryAllWorkItems = project.workItems?.filter(w => w.category === category) || [];
          const categoryAllWorkItemIds = new Set(categoryAllWorkItems.map(w => w.id));
          
          let totalM3 = 0;
          let spentMH = 0;
          let earnedMH = 0;
          
          for (const entry of project.dailyEntries || []) {
            const workItem = workItemMap.get(entry.workItemId);
            if (!workItem) continue;
            
            if (categoryM3WorkItemIds.has(entry.workItemId)) {
              totalM3 += entry.quantity || 0;
            }
            
            if (categoryAllWorkItemIds.has(entry.workItemId)) {
              spentMH += entry.manHours || 0;
              earnedMH += (entry.quantity || 0) * (workItem.targetManHours || 0);
            }
          }
          
          const unitMH = totalM3 > 0 ? spentMH / totalM3 : 0;
          const efficiency = spentMH > 0 ? (earnedMH / spentMH) * 100 : 0;
          
          categoryStats[category] = { totalM3, spentMH, earnedMH, unitMH, efficiency };
        }
        
        const categoryLabels: Record<string, string> = {
          Temel: 'Temel',
          Ustyapi: 'Üstyapı',
          Grobeton: 'Grobeton',
        };
        
        const hasData = categories.some(cat => categoryStats[cat].totalM3 > 0 || categoryStats[cat].spentMH > 0);
        
        if (!hasData) return null;
        
        return (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Kategori Bazlı İstatistikler
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* m³ Quantities */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    İmalat Miktarı (m³)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-sm">{categoryLabels[cat]}</span>
                      <span className="font-semibold" data-testid={`text-category-m3-${cat.toLowerCase()}`}>
                        {categoryStats[cat].totalM3.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Unit MH (Spent MH / Earned MH) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Adam-Saat (Harcanan / Kazanılan)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-sm">{categoryLabels[cat]}</span>
                      <span className="font-semibold" data-testid={`text-category-unit-mh-${cat.toLowerCase()}`}>
                        {categoryStats[cat].spentMH.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} / {categoryStats[cat].earnedMH.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Efficiency (Earned MH / Spent MH) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Verimlilik (%)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-sm">{categoryLabels[cat]}</span>
                      <span 
                        className={`font-semibold ${categoryStats[cat].efficiency >= 100 ? 'text-green-600' : categoryStats[cat].efficiency >= 80 ? 'text-yellow-600' : 'text-orange-600'}`}
                        data-testid={`text-category-efficiency-${cat.toLowerCase()}`}
                      >
                        {categoryStats[cat].efficiency.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })()}

      {/* İmalat Bazlı İstatistikler */}
      {(() => {
        // Calculate stats based on parentBudgetCode (T, K, P, D, M, DES, IST)
        const imalatCodes = ['T', 'K', 'P', 'D', 'M', 'DES', 'IST'];
        const imalatLabels: Record<string, string> = {
          T: 'T (Temel)',
          K: 'K (Kolon)',
          P: 'P (Perde)',
          D: 'D (Döşeme)',
          M: 'M (Merdiven)',
          DES: 'DES (Destek)',
          IST: 'IST (Isıtma)',
        };
        
        const imalatStats: Record<string, { totalM3: number; spentMH: number; earnedMH: number; unitMH: number; efficiency: number }> = {};
        const workItemMap = new Map(project.workItems?.map(w => [w.id, w]) || []);
        
        for (const code of imalatCodes) {
          // Determine the unit to use for quantity calculation
          // DES uses m3(destek), IST uses m3(isitma), others use m3
          let quantityUnit = 'm3';
          if (code === 'DES') quantityUnit = 'm3(destek)';
          if (code === 'IST') quantityUnit = 'm3(isitma)';
          
          // Work items with specific unit for quantity calculation
          const codeQuantityWorkItems = project.workItems?.filter(w => 
            w.parentBudgetCode === code && w.unit === quantityUnit
          ) || [];
          const codeQuantityWorkItemIds = new Set(codeQuantityWorkItems.map(w => w.id));
          
          // All work items for this code for MH calculations
          const codeAllWorkItems = project.workItems?.filter(w => w.parentBudgetCode === code) || [];
          const codeAllWorkItemIds = new Set(codeAllWorkItems.map(w => w.id));
          
          let totalQuantity = 0;
          let spentMH = 0;
          let earnedMH = 0;
          
          for (const entry of project.dailyEntries || []) {
            const workItem = workItemMap.get(entry.workItemId);
            if (!workItem) continue;
            
            // Quantity for work items with the specific unit
            if (codeQuantityWorkItemIds.has(entry.workItemId)) {
              totalQuantity += entry.quantity || 0;
            }
            
            // MH for all work items in this code
            if (codeAllWorkItemIds.has(entry.workItemId)) {
              spentMH += entry.manHours || 0;
              // Earned MH = quantity × targetManHours (birim adam saat)
              earnedMH += (entry.quantity || 0) * (workItem.targetManHours || 0);
            }
          }
          
          const unitMH = totalQuantity > 0 ? spentMH / totalQuantity : 0;
          const efficiency = spentMH > 0 ? (earnedMH / spentMH) * 100 : 0;
          
          imalatStats[code] = { totalM3: totalQuantity, spentMH, earnedMH, unitMH, efficiency };
        }
        
        // Filter codes that have data
        const activeCodes = imalatCodes.filter(code => 
          imalatStats[code].totalM3 > 0 || imalatStats[code].spentMH > 0
        );
        
        if (activeCodes.length === 0) return null;
        
        return (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              İmalat Bazlı İstatistikler
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* m³ Quantities */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    İmalat Miktarı (m³)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeCodes.map(code => (
                    <div key={code} className="flex items-center justify-between">
                      <span className="text-sm">{imalatLabels[code]}</span>
                      <span className="font-semibold" data-testid={`text-imalat-m3-${code.toLowerCase()}`}>
                        {imalatStats[code].totalM3.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Unit MH (Spent MH / Earned MH) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Adam-Saat (Harcanan / Kazanılan)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeCodes.map(code => (
                    <div key={code} className="flex items-center justify-between">
                      <span className="text-sm">{imalatLabels[code]}</span>
                      <span className="font-semibold" data-testid={`text-imalat-unit-mh-${code.toLowerCase()}`}>
                        {imalatStats[code].spentMH.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} / {imalatStats[code].earnedMH.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Efficiency (Earned MH / Spent MH) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Verimlilik (%)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeCodes.map(code => (
                    <div key={code} className="flex items-center justify-between">
                      <span className="text-sm">{imalatLabels[code]}</span>
                      <span 
                        className={`font-semibold ${imalatStats[code].efficiency >= 100 ? 'text-green-600' : imalatStats[code].efficiency >= 80 ? 'text-yellow-600' : 'text-orange-600'}`}
                        data-testid={`text-imalat-efficiency-${code.toLowerCase()}`}
                      >
                        {imalatStats[code].efficiency.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })()}

      {/* Current Month Stats Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {currentMonthStats.monthName} {currentMonthStats.year} - Aylık Performans
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold truncate" data-testid="text-monthly-spent-mh">
                    {currentMonthStats.spentMH.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-sm text-muted-foreground">Aylık Harcanan MH</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold truncate" data-testid="text-monthly-concrete">
                    {currentMonthStats.pouredConcrete.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-muted-foreground">Aylık Dökülen Beton (m³)</p>
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
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold truncate" data-testid="text-monthly-progress-mh">
                    {currentMonthStats.pouredConcrete > 0
                      ? currentMonthStats.progressMH.toLocaleString("tr-TR", { maximumFractionDigits: 2 })
                      : "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">Aylık İlerleme MH</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-orange-500/10">
                  <BarChart3 className="h-6 w-6 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold truncate" data-testid="text-monthly-efficiency">
                    {currentMonthStats.spentMH > 0
                      ? `%${currentMonthStats.efficiency.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
                      : "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">Verimlilik</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </div>

        {/* Right side - Weather Widget */}
        {project.location && (
          <div className="lg:w-[280px]">
            <Card className="sticky top-6" data-testid="card-weather">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{weather?.location?.name || project.location}</span>
                </div>
                <p className="text-xs text-muted-foreground">{todayFormatted}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {weatherLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : weather ? (
                  <>
                    {/* Current Weather */}
                    <div className="flex items-center gap-4" data-testid="weather-current">
                      {getWeatherIcon(weather.today.icon, "h-12 w-12")}
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold">{weather.current.temperature}°</span>
                          <span className="text-sm text-muted-foreground">{weather.today.description}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Thermometer className="h-3 w-3" />
                          <span>{weather.today.tempMax}° / {weather.today.tempMin}°</span>
                        </div>
                      </div>
                    </div>

                    {/* 7-day Forecast */}
                    <div className="border-t pt-3" data-testid="weather-forecast">
                      <p className="text-xs font-medium text-muted-foreground mb-2">7 Günlük Tahmin</p>
                      <div className="space-y-2">
                        {weather.forecast.map((day, idx) => {
                          const dateInfo = formatTurkishDate(day.date);
                          return (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 w-16">
                                <span className="text-muted-foreground">{dateInfo.day}</span>
                                <span className="text-xs">{dateInfo.date}</span>
                              </div>
                              {getWeatherIcon(day.icon, "h-5 w-5")}
                              <div className="flex items-center gap-1 w-16 justify-end">
                                <span className="font-medium">{day.tempMax}°</span>
                                <span className="text-muted-foreground">{day.tempMin}°</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Hava durumu bilgisi alınamadı
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="overview" data-testid="tab-overview" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Genel Bakış</span>
          </TabsTrigger>
          <TabsTrigger value="data-entry" data-testid="tab-data-entry" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Veri Girişi</span>
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Raporlar</span>
          </TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Ekip</span>
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Ayarlar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Proje Bilgileri</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Planlanan Adam-Saat</p>
                    <p className="font-semibold">{(project.plannedManHours || 0).toLocaleString("tr-TR")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Toplam Beton</p>
                    <p className="font-semibold">{(project.totalConcrete || 0).toLocaleString("tr-TR")} m³</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Planlanan Birim A-S</p>
                    <p className="font-semibold">
                      {project.totalConcrete && project.totalConcrete > 0
                        ? ((project.plannedManHours || 0) / project.totalConcrete).toFixed(2)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Başlangıç Tarihi</p>
                    <p className="font-semibold">
                      {project.startDate
                        ? new Date(project.startDate).toLocaleDateString("tr-TR")
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bitiş Tarihi</p>
                    <p className="font-semibold">
                      {project.startDate && project.totalDuration
                        ? (() => {
                            const start = new Date(project.startDate);
                            start.setDate(start.getDate() + project.totalDuration);
                            return start.toLocaleDateString("tr-TR");
                          })()
                        : "-"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">İmalat Kalemleri</CardTitle>
                <CardDescription>
                  Projede tanımlı {project.workItems?.length || 0} imalat kalemi
                </CardDescription>
              </CardHeader>
              <CardContent>
                {project.workItems && project.workItems.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {project.workItems.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      >
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.budgetCode}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {item.targetQuantity} {item.unit}
                          </Badge>
                          <Badge variant="outline">
                            {item.targetManHours} A-S
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {project.workItems.length > 5 && (
                      <p className="text-sm text-muted-foreground text-center pt-2">
                        +{project.workItems.length - 5} daha fazla
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Henüz imalat kalemi eklenmedi
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data-entry" className="mt-6">
          <DataEntryTab project={project} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportsTab project={project} />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamTab project={project} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <ProjectSettingsTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
