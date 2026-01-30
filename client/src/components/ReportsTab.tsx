import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, FileDown, FileSpreadsheet, Calendar, Filter, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { Project } from "@shared/schema";

interface WorkItemStats {
  id: string;
  budgetCode: string;
  name: string;
  unit: string;
  targetQuantity: number;
  targetManHours: number;
  actualQuantity: number;
  actualManHours: number;
  progressPercent: number;
}

interface DailyData {
  date: string;
  manHours: number;
  quantity: number;
  target: number;
  earnedManHours: number;
  concrete: number;
  formwork: number;
  rebar: number;
}

interface WeeklyData {
  week: string;
  manHours: number;
  quantity: number;
  target: number;
  earnedManHours: number;
  concrete: number;
  formwork: number;
  rebar: number;
}

interface ReportData {
  daily: DailyData[];
  weekly: WeeklyData[];
  monthly: { month: string; manHours: number; quantity: number; target: number; earnedManHours: number; cumulativeManHours: number; cumulativeEarnedManHours: number }[];
  monthlyConcrete: { month: string; actual: number; planned: number }[];
  cumulative: { date: string; cumulativeManHours: number; cumulativeQuantity: number; cumulativeTarget: number }[];
  workItems: WorkItemStats[];
  lastDayStats: DailyData | null;
  lastWeekStats: WeeklyData | null;
  summary: {
    totalPlannedManHours: number;
    totalSpentManHours: number;
    totalPlannedConcrete: number;
    totalQuantity: number;
  };
}

interface ReportsTabProps {
  project: Project;
}

export function ReportsTab({ project }: ReportsTabProps) {
  const [reportType, setReportType] = useState("daily");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);
  const queryString = queryParams.toString();

  const { data: reportData, isLoading, refetch } = useQuery<ReportData>({
    queryKey: ["/api/projects", project.id, "reports", queryString],
    queryFn: async () => {
      const url = `/api/projects/${project.id}/reports${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
  });

  const formatTurkishDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  };

  const formatTurkishMonth = (monthStr: string) => {
    const months: Record<string, string> = {
      "01": "Ocak", "02": "Şubat", "03": "Mart", "04": "Nisan",
      "05": "Mayıs", "06": "Haziran", "07": "Temmuz", "08": "Ağustos",
      "09": "Eylül", "10": "Ekim", "11": "Kasım", "12": "Aralık",
    };
    const [year, month] = monthStr.split("-");
    return `${months[month] || month} ${year}`;
  };

  const getTrend = (current: number, target: number) => {
    if (target === 0) return { icon: Minus, color: "text-muted-foreground", text: "Hedef yok" };
    const ratio = current / target;
    if (ratio >= 1) return { icon: TrendingUp, color: "text-green-600", text: "Hedefin üzerinde" };
    if (ratio >= 0.8) return { icon: Minus, color: "text-orange-500", text: "Hedefe yakın" };
    return { icon: TrendingDown, color: "text-red-500", text: "Hedefin altında" };
  };

  const handleApplyFilter = () => {
    refetch();
  };

  const handleClearFilter = () => {
    setStartDate("");
    setEndDate("");
    setTimeout(() => refetch(), 100);
  };

  const exportToExcel = () => {
    if (!reportData) {
      toast({
        title: "Uyarı",
        description: "Dışa aktarılacak veri bulunamadı.",
        variant: "destructive",
      });
      return;
    }

    const workbook = XLSX.utils.book_new();

    const dailySheet = XLSX.utils.json_to_sheet(
      reportData.daily.map((d) => {
        const [year, month, day] = d.date.split("-");
        const formattedDate = `${day}.${month}.${year}`;
        return {
          "Tarih": formattedDate,
          "Adam-Saat": d.manHours,
          "Miktar": d.quantity,
          "Hedef": Math.round(d.target),
        };
      })
    );
    XLSX.utils.book_append_sheet(workbook, dailySheet, "Günlük");

    const weeklySheet = XLSX.utils.json_to_sheet(
      reportData.weekly.map((w) => ({
        "Hafta": w.week,
        "Adam-Saat": w.manHours,
        "Miktar": w.quantity,
        "Hedef": Math.round(w.target),
      }))
    );
    XLSX.utils.book_append_sheet(workbook, weeklySheet, "Haftalık");

    const monthlySheet = XLSX.utils.json_to_sheet(
      reportData.monthly.map((m) => ({
        "Ay": formatTurkishMonth(m.month),
        "Adam-Saat": m.manHours,
        "Miktar": m.quantity,
        "Hedef": Math.round(m.target),
      }))
    );
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Aylık");

    const cumulativeSheet = XLSX.utils.json_to_sheet(
      reportData.cumulative.map((c) => {
        const [year, month, day] = c.date.split("-");
        const formattedDate = `${day}.${month}.${year}`;
        return {
          "Tarih": formattedDate,
          "Toplam Adam-Saat": c.cumulativeManHours,
          "Toplam Miktar": c.cumulativeQuantity,
          "Kümülatif Hedef": Math.round(c.cumulativeTarget),
        };
      })
    );
    XLSX.utils.book_append_sheet(workbook, cumulativeSheet, "Kümülatif");

    if (reportData.workItems && reportData.workItems.length > 0) {
      const workItemsSheet = XLSX.utils.json_to_sheet(
        reportData.workItems.map((wi) => {
          const progressUnitMH = wi.actualQuantity > 0 ? wi.actualManHours / wi.actualQuantity : 0;
          const targetUnitMH = wi.targetManHours; // Already per-unit from template
          const efficiency = progressUnitMH > 0 && targetUnitMH > 0 ? (targetUnitMH / progressUnitMH) * 100 : 0;
          return {
            "Bütçe Kodu": wi.budgetCode,
            "İmalat Kalemi": wi.name,
            "Birim": wi.unit,
            "Hedef Miktar": wi.targetQuantity,
            "Gerçekleşen Miktar": wi.actualQuantity,
            "Hedef Birim A-S": targetUnitMH > 0 ? Number(targetUnitMH.toFixed(2)) : "-",
            "Gerçekleşen Adam-Saat": wi.actualManHours,
            "İlerleme Birim A-S": progressUnitMH > 0 ? Number(progressUnitMH.toFixed(2)) : "-",
            "İlerleme (%)": Math.round(wi.progressPercent),
            "Verimlilik (%)": progressUnitMH > 0 && targetUnitMH > 0 ? Math.round(efficiency) : "-",
          };
        })
      );
      XLSX.utils.book_append_sheet(workbook, workItemsSheet, "İmalat Kalemleri");
    }

    const summarySheet = XLSX.utils.json_to_sheet([
      {
        "Metrik": "Planlanan Adam-Saat",
        "Değer": reportData.summary.totalPlannedManHours,
      },
      {
        "Metrik": "Gerçekleşen Adam-Saat",
        "Değer": reportData.summary.totalSpentManHours,
      },
      {
        "Metrik": "Planlanan Miktar",
        "Değer": reportData.summary.totalPlannedConcrete,
      },
      {
        "Metrik": "Gerçekleşen Miktar",
        "Değer": reportData.summary.totalQuantity,
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Özet");

    const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : "";
    XLSX.writeFile(workbook, `${project.name}_rapor${dateRange}.xlsx`);

    toast({
      title: "Başarılı",
      description: "Excel raporu indirildi.",
    });
  };

  const exportToPDF = async () => {
    if (!reportRef.current || !reportData) {
      toast({
        title: "Uyarı",
        description: "PDF oluşturulamadı.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);

    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        scrollY: -window.scrollY,
        scrollX: 0,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 20;

      pdf.setFontSize(16);
      pdf.text(`${project.name} - Performans Raporu`, 20, 30);
      
      if (startDate && endDate) {
        pdf.setFontSize(10);
        pdf.text(`Tarih Aralığı: ${startDate} - ${endDate}`, 20, 45);
        position = 55;
      } else {
        position = 50;
      }

      pdf.addImage(imgData, "PNG", 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - position;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 20, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const dateRange = startDate && endDate ? `_${startDate}_${endDate}` : "";
      pdf.save(`${project.name}_rapor${dateRange}.pdf`);

      toast({
        title: "Başarılı",
        description: "PDF raporu indirildi.",
      });
    } catch (error) {
      console.error("PDF export error:", error);
      toast({
        title: "Hata",
        description: "PDF oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full max-w-lg" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const chartColors = {
    manHours: "#1E3A8A",
    quantity: "#10B981",
    target: "#F59E0B",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Rapor Filtreleri ve Dışa Aktarım
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label>Başlangıç Tarihi</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-40 justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                    data-testid="button-start-date-picker"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {startDate ? format(parseISO(startDate), "dd.MM.yyyy") : <span>Seçiniz</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate ? parseISO(startDate) : undefined}
                    onSelect={(date) => setStartDate(date ? format(date, "yyyy-MM-dd") : "")}
                    initialFocus
                    locale={tr}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Bitiş Tarihi</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-40 justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                    data-testid="button-end-date-picker"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {endDate ? format(parseISO(endDate), "dd.MM.yyyy") : <span>Seçiniz</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate ? parseISO(endDate) : undefined}
                    onSelect={(date) => setEndDate(date ? format(date, "yyyy-MM-dd") : "")}
                    initialFocus
                    locale={tr}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button type="button" onClick={handleApplyFilter} data-testid="button-apply-filter">
              Filtrele
            </Button>
            <Button type="button" variant="outline" onClick={handleClearFilter} data-testid="button-clear-filter">
              Temizle
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={exportToExcel} data-testid="button-export-excel">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button 
              type="button"
              variant="outline" 
              onClick={exportToPDF} 
              disabled={isExporting}
              data-testid="button-export-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExporting ? "Oluşturuluyor..." : "PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div ref={reportRef} className="space-y-6 bg-background p-4 rounded-lg">
        <Tabs value={reportType} onValueChange={setReportType}>
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="daily" data-testid="tab-daily">Günlük</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="tab-weekly">Haftalık</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">Aylık</TabsTrigger>
            <TabsTrigger value="cumulative" data-testid="tab-cumulative">Kümülatif</TabsTrigger>
            <TabsTrigger value="workitems" data-testid="tab-workitems">
              <Building2 className="h-4 w-4 mr-1" />
              İmalat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="mt-6">
            {/* Last Day Stats */}
            {reportData?.lastDayStats && (
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold">Son Giriş:</h3>
                  <span className="text-muted-foreground">
                    {new Date(reportData.lastDayStats.date).toLocaleDateString("tr-TR", { 
                      day: "numeric", 
                      month: "long", 
                      year: "numeric" 
                    })}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Günlük Dökülen Beton</p>
                      <p className="text-2xl font-bold" data-testid="text-daily-concrete">
                        {reportData.lastDayStats.concrete.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m³
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Günlük Kalıp</p>
                      <p className="text-2xl font-bold" data-testid="text-daily-formwork">
                        {reportData.lastDayStats.formwork.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Günlük Demir</p>
                      <p className="text-2xl font-bold" data-testid="text-daily-rebar">
                        {reportData.lastDayStats.rebar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ton
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Gerçekleşen Adam-Saat</p>
                      <p className="text-2xl font-bold" data-testid="text-daily-manhours">
                        {reportData.lastDayStats.manHours.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Günlük Adam-Saat Performansı</CardTitle>
                  <CardDescription>
                    {reportData?.lastDayStats 
                      ? `${formatTurkishMonth(reportData.lastDayStats.date.substring(0, 7))} ayı verileri`
                      : "Aylık adam-saat verileri"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const currentMonthData = reportData?.daily && reportData.lastDayStats
                      ? reportData.daily.filter(d => d.date.substring(0, 7) === reportData.lastDayStats!.date.substring(0, 7))
                      : reportData?.daily || [];
                    
                    return currentMonthData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={currentMonthData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d) => new Date(d).getDate().toString()}
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <YAxis
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            labelFormatter={formatTurkishDate}
                          />
                          <Legend />
                          <Bar
                            dataKey="manHours"
                            name="Adam-Saat"
                            fill={chartColors.manHours}
                            radius={[4, 4, 0, 0]}
                          />
                          <Line
                            type="monotone"
                            dataKey="target"
                            name="Hedef"
                            stroke={chartColors.target}
                            strokeDasharray="5 5"
                            strokeWidth={2}
                            dot={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Henüz veri bulunmuyor
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Günlük Beton Dökümü</CardTitle>
                  <CardDescription>
                    {reportData?.lastDayStats 
                      ? `${formatTurkishMonth(reportData.lastDayStats.date.substring(0, 7))} ayı beton verileri (m³)`
                      : "Aylık beton verileri (m³)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const currentMonthData = reportData?.daily && reportData.lastDayStats
                      ? reportData.daily.filter(d => d.date.substring(0, 7) === reportData.lastDayStats!.date.substring(0, 7))
                      : reportData?.daily || [];
                    
                    return currentMonthData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={currentMonthData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d) => new Date(d).getDate().toString()}
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <YAxis
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            labelFormatter={formatTurkishDate}
                            formatter={(value: number) => [`${value.toLocaleString("tr-TR")} m³`, "Beton"]}
                          />
                          <Legend />
                          <Bar
                            dataKey="concrete"
                            name="Beton (m³)"
                            fill={chartColors.quantity}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Henüz veri bulunmuyor
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="weekly" className="mt-6">
            {/* Last Week Stats */}
            {reportData?.lastWeekStats && (
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold">Son Hafta:</h3>
                  <span className="text-muted-foreground">
                    {reportData.lastWeekStats.week}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Haftalık Dökülen Beton</p>
                      <p className="text-2xl font-bold" data-testid="text-weekly-concrete">
                        {reportData.lastWeekStats.concrete.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m³
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Haftalık Kalıp</p>
                      <p className="text-2xl font-bold" data-testid="text-weekly-formwork">
                        {reportData.lastWeekStats.formwork.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m²
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Haftalık Demir</p>
                      <p className="text-2xl font-bold" data-testid="text-weekly-rebar">
                        {reportData.lastWeekStats.rebar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ton
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Gerçekleşen Adam-Saat</p>
                      <p className="text-2xl font-bold" data-testid="text-weekly-manhours">
                        {reportData.lastWeekStats.manHours.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Haftalık Adam-Saat Performansı</CardTitle>
                  <CardDescription>
                    {reportData?.lastWeekStats 
                      ? `Son ${Math.min(reportData.weekly.length, 8)} hafta verileri`
                      : "Haftalık adam-saat verileri"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const recentWeeklyData = reportData?.weekly?.slice(-8) || [];
                    
                    return recentWeeklyData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={recentWeeklyData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="week"
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(w) => w.split("-W")[1] ? `H${w.split("-W")[1]}` : w}
                          />
                          <YAxis
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend />
                          <Bar
                            dataKey="manHours"
                            name="Adam-Saat"
                            fill={chartColors.manHours}
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="target"
                            name="Hedef"
                            fill={chartColors.target}
                            radius={[4, 4, 0, 0]}
                            opacity={0.5}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Henüz veri bulunmuyor
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Haftalık Beton Dökümü</CardTitle>
                  <CardDescription>
                    {reportData?.lastWeekStats 
                      ? `Son ${Math.min(reportData.weekly.length, 8)} hafta beton verileri (m³)`
                      : "Haftalık beton verileri (m³)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const recentWeeklyData = reportData?.weekly?.slice(-8) || [];
                    
                    return recentWeeklyData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={recentWeeklyData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis
                            dataKey="week"
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                            tickFormatter={(w) => w.split("-W")[1] ? `H${w.split("-W")[1]}` : w}
                          />
                          <YAxis
                            fontSize={12}
                            tick={{ fill: "hsl(var(--muted-foreground))" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            formatter={(value: number) => [`${value.toLocaleString("tr-TR")} m³`, "Beton"]}
                          />
                          <Legend />
                          <Bar
                            dataKey="concrete"
                            name="Beton (m³)"
                            fill={chartColors.quantity}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Henüz veri bulunmuyor
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-6">
            {/* Monthly Man-Hours Performance Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Aylık Adam Saat Performansı</CardTitle>
                <CardDescription>
                  Aylık: Planlanan (yeşil), Gerçekleşen (mavi), Kazanılan (turuncu) | Kümülatif: Planlanan (yeşil çizgi), Gerçekleşen (mavi çizgi), Kazanılan (turuncu çizgi)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData?.monthly && reportData.monthly.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={reportData.monthly}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatTurkishMonth}
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        yAxisId="left"
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `${value.toLocaleString("tr-TR")}`}
                        label={{ value: "Aylık (A-S)", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))" } }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `${value.toLocaleString("tr-TR")}`}
                        label={{ value: "Kümülatif (A-S)", angle: 90, position: "insideRight", style: { textAnchor: "middle", fill: "hsl(var(--muted-foreground))" } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        labelFormatter={formatTurkishMonth}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} A-S`,
                          name
                        ]}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="target"
                        name="Aylık Planlanan"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="manHours"
                        name="Aylık Gerçekleşen"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="earnedManHours"
                        name="Aylık Kazanılan"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativeTarget"
                        name="Kümülatif Planlanan"
                        stroke="#22c55e"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: "#22c55e", strokeWidth: 2 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativeManHours"
                        name="Kümülatif Gerçekleşen"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: "#3b82f6", strokeWidth: 2 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativeEarnedManHours"
                        name="Kümülatif Kazanılan"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ fill: "#f97316", strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Henüz veri bulunmuyor
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Monthly Concrete Performance Section */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Aylık İmalat Performansı (Beton - m³)</CardTitle>
                <CardDescription>
                  Aylık beton imalat miktarları: Gerçekleşen (mavi) ve İş Programı (turuncu)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData?.monthlyConcrete && reportData.monthlyConcrete.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={reportData.monthlyConcrete}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatTurkishMonth}
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `${value.toLocaleString("tr-TR")}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        labelFormatter={formatTurkishMonth}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} m³`,
                          name
                        ]}
                      />
                      <Legend />
                      <Bar
                        dataKey="actual"
                        name="Gerçekleşen"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="planned"
                        name="İş Programı"
                        fill="#f97316"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                    Henüz veri bulunmuyor
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cumulative" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Kümülatif Adam-Saat Performansı</CardTitle>
                <CardDescription>
                  Kümülatif Gerçekleşen (mavi çizgi) ve Kümülatif Kazanılan (turuncu çizgi) Adam-Saat
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData?.cumulative && reportData.cumulative.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={reportData.cumulative}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatTurkishDate}
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        fontSize={12}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) => `${value.toLocaleString("tr-TR")}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        labelFormatter={formatTurkishDate}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} A-S`,
                          name
                        ]}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="cumulativeManHours"
                        name="Kümülatif Gerçekleşen"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeEarnedManHours"
                        name="Kümülatif Kazanılan"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Henüz veri bulunmuyor
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workitems" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  İmalat Kalemlerine Göre Performans
                </CardTitle>
                <CardDescription>
                  Her bir imalat kalemi için hedef ve gerçekleşen değerler
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData?.workItems && reportData.workItems.length > 0 ? (
                  <div className="space-y-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bütçe Kodu</TableHead>
                          <TableHead>İmalat Kalemi</TableHead>
                          <TableHead>Birim</TableHead>
                          <TableHead className="text-right">Hedef Miktar</TableHead>
                          <TableHead className="text-right">Gerçekleşen</TableHead>
                          <TableHead className="text-right">Birim A-S</TableHead>
                          <TableHead>İlerleme</TableHead>
                          <TableHead className="text-right">Verimlilik</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.workItems.map((wi) => {
                          // Calculate progress unit man-hours (actual man-hours per actual quantity)
                          const progressUnitMH = wi.actualQuantity > 0 
                            ? wi.actualManHours / wi.actualQuantity 
                            : 0;
                          // Target unit MH is directly from template (already per-unit value)
                          const targetUnitMH = wi.targetManHours;
                          // Efficiency: target unit MH / progress unit MH (higher is better)
                          const efficiency = progressUnitMH > 0 && targetUnitMH > 0
                            ? (targetUnitMH / progressUnitMH) * 100 
                            : 0;
                          
                          return (
                            <TableRow key={wi.id}>
                              <TableCell>
                                <Badge variant="outline">{wi.budgetCode}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">{wi.name}</TableCell>
                              <TableCell>{wi.unit}</TableCell>
                              <TableCell className="text-right">{wi.targetQuantity.toLocaleString("tr-TR")}</TableCell>
                              <TableCell className="text-right">{wi.actualQuantity.toLocaleString("tr-TR")}</TableCell>
                              <TableCell className="text-right">
                                {wi.actualQuantity > 0 ? (
                                  <span>
                                    {progressUnitMH.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {" / "}
                                    {targetUnitMH.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={Math.min(wi.progressPercent, 100)} className="w-20" />
                                  <span className="text-sm text-muted-foreground w-12 text-right">
                                    {Math.round(wi.progressPercent)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {progressUnitMH > 0 ? (
                                  <Badge 
                                    variant={efficiency >= 100 ? "default" : "secondary"}
                                    className={efficiency >= 100 ? "bg-green-600" : ""}
                                  >
                                    %{Math.round(efficiency)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Henüz imalat kalemi bulunmuyor
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
