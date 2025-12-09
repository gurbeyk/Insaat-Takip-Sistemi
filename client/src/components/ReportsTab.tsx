import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Project } from "@shared/schema";

interface ReportData {
  daily: { date: string; manHours: number; quantity: number; target: number }[];
  weekly: { week: string; manHours: number; quantity: number; target: number }[];
  monthly: { month: string; manHours: number; quantity: number; target: number }[];
  cumulative: { date: string; cumulativeManHours: number; cumulativeQuantity: number; cumulativeTarget: number }[];
}

interface ReportsTabProps {
  project: Project;
}

export function ReportsTab({ project }: ReportsTabProps) {
  const [reportType, setReportType] = useState("daily");

  const { data: reportData, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/projects", project.id, "reports"],
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
      <Tabs value={reportType} onValueChange={setReportType}>
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="daily" data-testid="tab-daily">Günlük</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">Haftalık</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly">Aylık</TabsTrigger>
          <TabsTrigger value="cumulative" data-testid="tab-cumulative">Kümülatif</TabsTrigger>
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
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
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
      </Tabs>
    </div>
  );
}
