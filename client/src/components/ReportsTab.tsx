import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

interface ReportData {
  daily: { date: string; manHours: number; quantity: number; target: number }[];
  weekly: { week: string; manHours: number; quantity: number; target: number }[];
  monthly: { month: string; manHours: number; quantity: number; target: number }[];
  cumulative: { date: string; cumulativeManHours: number; cumulativeQuantity: number; cumulativeTarget: number }[];
  workItems: WorkItemStats[];
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
      reportData.daily.map((d) => ({
        "Tarih": d.date,
        "Adam-Saat": d.manHours,
        "Miktar": d.quantity,
        "Hedef": Math.round(d.target),
      }))
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
      reportData.cumulative.map((c) => ({
        "Tarih": c.date,
        "Toplam Adam-Saat": c.cumulativeManHours,
        "Toplam Miktar": c.cumulativeQuantity,
        "Kümülatif Hedef": Math.round(c.cumulativeTarget),
      }))
    );
    XLSX.utils.book_append_sheet(workbook, cumulativeSheet, "Kümülatif");

    if (reportData.workItems && reportData.workItems.length > 0) {
      const workItemsSheet = XLSX.utils.json_to_sheet(
        reportData.workItems.map((wi) => {
          const progressUnitMH = wi.actualQuantity > 0 ? wi.actualManHours / wi.actualQuantity : 0;
          const targetUnitMH = wi.targetQuantity > 0 ? wi.targetManHours / wi.targetQuantity : 0;
          const efficiency = progressUnitMH > 0 ? (targetUnitMH / progressUnitMH) * 100 : 0;
          return {
            "Bütçe Kodu": wi.budgetCode,
            "İmalat Kalemi": wi.name,
            "Birim": wi.unit,
            "Hedef Miktar": wi.targetQuantity,
            "Gerçekleşen Miktar": wi.actualQuantity,
            "Hedef Adam-Saat": wi.targetManHours,
            "Gerçekleşen Adam-Saat": wi.actualManHours,
            "İlerleme Birim A-S": progressUnitMH > 0 ? Number(progressUnitMH.toFixed(2)) : "-",
            "Hedef Birim A-S": targetUnitMH > 0 ? Number(targetUnitMH.toFixed(2)) : "-",
            "İlerleme (%)": Math.round(wi.progressPercent),
            "Verimlilik (%)": progressUnitMH > 0 ? Math.round(efficiency) : "-",
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
              <Label htmlFor="startDate">Başlangıç Tarihi</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
                data-testid="input-start-date"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">Bitiş Tarihi</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
                data-testid="input-end-date"
              />
            </div>
            <Button onClick={handleApplyFilter} data-testid="button-apply-filter">
              <Calendar className="h-4 w-4 mr-2" />
              Filtrele
            </Button>
            <Button variant="outline" onClick={handleClearFilter} data-testid="button-clear-filter">
              Temizle
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button 
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
        {reportData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Planlanan Adam-Saat</p>
                <p className="text-2xl font-bold">{reportData.summary.totalPlannedManHours.toLocaleString("tr-TR")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Gerçekleşen Adam-Saat</p>
                <p className="text-2xl font-bold">{reportData.summary.totalSpentManHours.toLocaleString("tr-TR")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Planlanan Miktar</p>
                <p className="text-2xl font-bold">{reportData.summary.totalPlannedConcrete.toLocaleString("tr-TR")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Gerçekleşen Miktar</p>
                <p className="text-2xl font-bold">{reportData.summary.totalQuantity.toLocaleString("tr-TR")}</p>
              </CardContent>
            </Card>
          </div>
        )}

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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Günlük Adam-Saat Performansı</CardTitle>
                  <CardDescription>Son 30 günlük adam-saat verileri</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.daily && reportData.daily.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportData.daily}>
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
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Günlük Metraj Performansı</CardTitle>
                  <CardDescription>Son 30 günlük metraj verileri</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.daily && reportData.daily.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportData.daily}>
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
                        <Line
                          type="monotone"
                          dataKey="quantity"
                          name="Miktar"
                          stroke={chartColors.quantity}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Henüz veri bulunmuyor
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="weekly" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Haftalık Adam-Saat Performansı</CardTitle>
                  <CardDescription>Haftalık toplam adam-saat verileri</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.weekly && reportData.weekly.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportData.weekly}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="week"
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
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Haftalık Metraj Performansı</CardTitle>
                  <CardDescription>Haftalık toplam metraj verileri</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.weekly && reportData.weekly.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportData.weekly}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="week"
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
                        />
                        <Legend />
                        <Bar
                          dataKey="quantity"
                          name="Miktar"
                          fill={chartColors.quantity}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Henüz veri bulunmuyor
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Aylık Adam-Saat Performansı</CardTitle>
                  <CardDescription>Aylık toplam adam-saat ve hedef karşılaştırması</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.monthly && reportData.monthly.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={reportData.monthly}>
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
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                          labelFormatter={formatTurkishMonth}
                        />
                        <Legend />
                        <Bar
                          dataKey="manHours"
                          name="Gerçekleşen"
                          fill={chartColors.manHours}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="target"
                          name="Hedef"
                          fill={chartColors.target}
                          radius={[4, 4, 0, 0]}
                          opacity={0.6}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Henüz veri bulunmuyor
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Aylık Performans Özeti</CardTitle>
                  <CardDescription>Aylara göre performans değerlendirmesi</CardDescription>
                </CardHeader>
                <CardContent>
                  {reportData?.monthly && reportData.monthly.length > 0 ? (
                    <div className="space-y-4">
                      {reportData.monthly.slice(-6).map((month) => {
                        const trend = getTrend(month.manHours, month.target);
                        const TrendIcon = trend.icon;
                        return (
                          <div
                            key={month.month}
                            className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50"
                          >
                            <div>
                              <p className="font-medium">{formatTurkishMonth(month.month)}</p>
                              <p className="text-sm text-muted-foreground">
                                {month.manHours.toLocaleString("tr-TR")} / {month.target.toLocaleString("tr-TR")} A-S
                              </p>
                            </div>
                            <div className={`flex items-center gap-2 ${trend.color}`}>
                              <TrendIcon className="h-4 w-4" />
                              <span className="text-sm">{trend.text}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Henüz veri bulunmuyor
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cumulative" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Kümülatif Performans</CardTitle>
                <CardDescription>
                  Proje başlangıcından itibaren toplam adam-saat ve miktar birikimi
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData?.cumulative && reportData.cumulative.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={reportData.cumulative}>
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
                      <Area
                        type="monotone"
                        dataKey="cumulativeManHours"
                        name="Toplam Adam-Saat"
                        stroke={chartColors.manHours}
                        fill={chartColors.manHours}
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeTarget"
                        name="Hedef"
                        stroke={chartColors.target}
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
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
                          // Calculate unit man-hours (man-hours per quantity)
                          const progressUnitMH = wi.actualQuantity > 0 
                            ? wi.actualManHours / wi.actualQuantity 
                            : 0;
                          const targetUnitMH = wi.targetQuantity > 0 
                            ? wi.targetManHours / wi.targetQuantity 
                            : 0;
                          // Efficiency: target unit MH / progress unit MH (higher is better)
                          const efficiency = progressUnitMH > 0 
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
