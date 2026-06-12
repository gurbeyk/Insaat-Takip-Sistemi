import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, CalendarDays, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { validateWorkSchedule, validateDetailedMonthlyPlan, validateWorkRegions, formatValidationSummary } from "@/lib/excelValidation";
import type { Project, MonthlyWorkItemSchedule, DetailedMonthlyPlan, WorkRegion } from "@shared/schema";

const TURKISH_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

const projectSettingsSchema = z.object({
  name: z.string().min(1, "Proje adı zorunludur"),
  description: z.string().optional(),
  plannedManHours: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  totalDuration: z.coerce.number().min(1, "İş süresi en az 1 gün olmalıdır"),
  totalConcrete: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  status: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
});

type ProjectSettingsFormValues = z.infer<typeof projectSettingsSchema>;

interface ProjectSettingsTabProps {
  project: Project;
}

export function ProjectSettingsTab({ project }: ProjectSettingsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailedFileInputRef = useRef<HTMLInputElement>(null);
  const [workScheduleFile, setWorkScheduleFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [detailedPlanFile, setDetailedPlanFile] = useState<File | null>(null);
  const [detailedUploadStatus, setDetailedUploadStatus] = useState<{ success: boolean; message: string } | null>(null);
  const workRegionsFileInputRef = useRef<HTMLInputElement>(null);
  const [workRegionsFile, setWorkRegionsFile] = useState<File | null>(null);
  const [workRegionsUploadStatus, setWorkRegionsUploadStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch existing work schedule
  const { data: workSchedule } = useQuery<MonthlyWorkItemSchedule[]>({
    queryKey: [`/api/projects/${project.id}/work-schedule`],
  });

  // Fetch existing detailed monthly plans (all months)
  const { data: detailedPlans } = useQuery<DetailedMonthlyPlan[]>({
    queryKey: [`/api/projects/${project.id}/detailed-monthly-plan`],
  });

  // Fetch existing work regions (İmalat Bölgesi / İmalat Kotu tanımları)
  const { data: workRegions } = useQuery<WorkRegion[]>({
    queryKey: [`/api/projects/${project.id}/work-regions`],
  });

  // Group detailed plans by month/year for summary display
  const detailedPlanSummary = detailedPlans
    ? Array.from(
        detailedPlans.reduce((acc, p) => {
          const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
          if (!acc.has(key)) acc.set(key, { year: p.year, month: p.month, count: 0 });
          acc.get(key)!.count++;
          return acc;
        }, new Map<string, { year: number; month: number; count: number }>()),
      )
      .map(([, v]) => v)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    : [];

  const form = useForm<ProjectSettingsFormValues>({
    resolver: zodResolver(projectSettingsSchema),
    defaultValues: {
      name: project.name,
      description: project.description || "",
      plannedManHours: project.plannedManHours || 0,
      totalDuration: project.totalDuration || 0,
      totalConcrete: project.totalConcrete || 0,
      status: project.status || "active",
      startDate: project.startDate || "",
      endDate: project.endDate || "",
      location: project.location || "",
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: ProjectSettingsFormValues) => {
      return await apiRequest("PATCH", `/api/projects/${project.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Proje Güncellendi",
        description: "Proje bilgileri başarıyla kaydedildi.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Proje güncellenirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/projects/${project.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Proje Silindi",
        description: "Proje başarıyla silindi.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Proje silinirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ProjectSettingsFormValues) => {
    updateProjectMutation.mutate(values);
  };

  // Detailed monthly plan upload mutation
  const detailedPlanMutation = useMutation({
    mutationFn: async (data: { items: any[]; year: number; month: number }) => {
      return await apiRequest("POST", `/api/projects/${project.id}/detailed-monthly-plan/bulk`, data);
    },
    onSuccess: (data: any) => {
      const count = data?.count || 0;
      const message = `Detaylı aylık iş programı başarıyla yüklendi. ${count} kayıt kaydedildi.`;
      setDetailedUploadStatus({ success: true, message });
      setDetailedPlanFile(null);
      toast({ title: "Yüklendi", description: message });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/detailed-monthly-plan`] });
    },
    onError: (error: Error) => {
      const message = error.message || "Yüklenirken hata oluştu.";
      setDetailedUploadStatus({ success: false, message });
      toast({ title: "Hata", description: message, variant: "destructive" });
    },
  });

  const handleDetailedPlanFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDetailedPlanFile(file);
    setDetailedUploadStatus(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      const result = validateDetailedMonthlyPlan(jsonData);
      if (result.errors.length > 0) {
        setDetailedUploadStatus({ success: false, message: result.errors.map(e => e.message).join("\n") });
        return;
      }
      if (result.validItems.length === 0) {
        setDetailedUploadStatus({ success: false, message: result.warnings.join("\n") || "Geçerli veri bulunamadı." });
        return;
      }
      if (!result.year || !result.month) {
        setDetailedUploadStatus({ success: false, message: "Dönem (ay/yıl) bilgisi okunamadı." });
        return;
      }
      const summary = `${result.validItems.length} m³ satırı bulundu (${TURKISH_MONTHS[result.month - 1]} ${result.year}). Yükleniyor...`;
      setDetailedUploadStatus({ success: true, message: summary });
      detailedPlanMutation.mutate({
        items: result.validItems,
        year: result.year,
        month: result.month,
      });
    } catch {
      setDetailedUploadStatus({ success: false, message: "Excel dosyası okunamadı." });
    }
  };

  // Work regions (İmalat Bölgesi / İmalat Kotu) upload mutation
  const workRegionsMutation = useMutation({
    mutationFn: async (data: { items: { region: string; imalatKotu: string }[] }) => {
      return await apiRequest("POST", `/api/projects/${project.id}/work-regions/bulk`, data);
    },
    onSuccess: (data: any) => {
      const count = data?.count || 0;
      const message = `İmalat Bölgesi / Kotu tanımları başarıyla yüklendi. ${count} kayıt kaydedildi.`;
      setWorkRegionsUploadStatus({ success: true, message });
      setWorkRegionsFile(null);
      toast({ title: "Yüklendi", description: message });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/work-regions`] });
    },
    onError: (error: Error) => {
      const message = error.message || "Yüklenirken hata oluştu.";
      setWorkRegionsUploadStatus({ success: false, message });
      toast({ title: "Hata", description: message, variant: "destructive" });
    },
  });

  const handleWorkRegionsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorkRegionsFile(file);
    setWorkRegionsUploadStatus(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      const result = validateWorkRegions(jsonData);

      if (result.errors.length > 0) {
        const errorMessages = result.errors.slice(0, 5).map(err => `Satır ${err.row}: ${err.message}`).join("\n");
        setWorkRegionsUploadStatus({ success: false, message: `Doğrulama hataları:\n${errorMessages}` });
        return;
      }

      if (result.validItems.length === 0) {
        setWorkRegionsUploadStatus({ success: false, message: result.warnings.join("\n") || "Geçerli veri bulunamadı." });
        return;
      }

      const summary = `${result.validItems.length} kombinasyon bulundu. Yükleniyor...`;
      setWorkRegionsUploadStatus({ success: true, message: summary });
      workRegionsMutation.mutate({ items: result.validItems });
    } catch {
      setWorkRegionsUploadStatus({ success: false, message: "Excel dosyası okunamadı." });
    } finally {
      e.target.value = "";
    }
  };

  const downloadWorkRegionsTemplate = () => {
    const templateData = [
      { "İmalat Bölgesi": "A Blok", "İmalat Kotu": "+3.50" },
      { "İmalat Bölgesi": "A Blok", "İmalat Kotu": "+6.50" },
      { "İmalat Bölgesi": "B Blok", "İmalat Kotu": "+3.50" },
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bölge-Kotu");
    XLSX.writeFile(workbook, "imalat_bolgesi_kotu_sablonu.xlsx");
  };

  // Work schedule upload mutation
  const workScheduleMutation = useMutation({
    mutationFn: async (data: { 
      items: { workItemName: string; year: number; month: number; plannedQuantity: number }[],
      monthlyManHours?: { year: number; month: number; plannedManHours: number }[]
    }) => {
      return await apiRequest("POST", `/api/projects/${project.id}/work-schedule/bulk`, data);
    },
    onSuccess: (_data: any) => {
      const manHoursCount = _data?.monthlyManHoursCount || 0;
      let message = "İş programı başarıyla yüklendi.";
      if (manHoursCount > 0) {
        message += ` ${manHoursCount} aylık adam saat verisi kaydedildi.`;
      }
      setUploadStatus({ success: true, message });
      setWorkScheduleFile(null);
      toast({
        title: "İş Programı Yüklendi",
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/work-schedule`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/schedule`] });
    },
    onError: (error: Error) => {
      setUploadStatus({ success: false, message: error.message || "İş programı yüklenirken bir hata oluştu." });
      toast({
        title: "Hata",
        description: error.message || "İş programı yüklenirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const handleWorkScheduleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWorkScheduleFile(file);
    setUploadStatus(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      const result = validateWorkSchedule(jsonData);

      if (result.errors.length > 0) {
        const errorMessages = result.errors.slice(0, 5).map(e => `Satır ${e.row}: ${e.message}`).join("\n");
        setUploadStatus({ success: false, message: `Doğrulama hataları:\n${errorMessages}` });
        return;
      }

      // Final guard: never call API with empty items
      if (result.validItems.length === 0) {
        let message = "Geçerli veri bulunamadı.";
        if (result.warnings.length > 0) {
          message = result.warnings.join("\n");
        }
        if (result.errors.length > 0) {
          message += `\n\nHatalar:\n${result.errors.slice(0, 3).map(e => `Satır ${e.row}: ${e.message}`).join("\n")}`;
        }
        setUploadStatus({ success: false, message });
        // No toast here - only show the alert with error details
        return;
      }

      // Build validation summary
      const uniqueWorkItems = new Set(result.validItems.map(i => i.workItemName));
      const uniqueMonths = new Set(result.validItems.map(i => `${i.year}-${i.month}`));
      
      let summary = `${result.validItems.length} kayıt, ${uniqueWorkItems.size} imalat kalemi, ${uniqueMonths.size} ay bulundu.`;
      if (result.monthlyManHours && result.monthlyManHours.length > 0) {
        summary += ` ${result.monthlyManHours.length} aylık adam saat verisi.`;
      }
      if (result.warnings.length > 0) {
        summary += ` (${result.warnings.length} uyarı)`;
        // Also set status to show warnings in the UI
        setUploadStatus({ success: true, message: `Uyarılar:\n${result.warnings.join("\n")}` });
      }

      // Upload the validated items - toast only fires here when we're actually uploading
      toast({
        title: "Yükleniyor",
        description: summary,
      });
      workScheduleMutation.mutate({ 
        items: result.validItems,
        monthlyManHours: result.monthlyManHours 
      });
    } catch (error) {
      setUploadStatus({ success: false, message: "Excel dosyası okunamadı." });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Proje Ayarları</CardTitle>
          <CardDescription>
            Proje bilgilerini güncelleyin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proje Adı *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-settings-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durum</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Aktif</SelectItem>
                          <SelectItem value="paused">Beklemede</SelectItem>
                          <SelectItem value="completed">Tamamlandı</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Açıklama</FormLabel>
                    <FormControl>
                      <Textarea {...field} data-testid="input-settings-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="plannedManHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Planlanan Adam-Saat</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          data-testid="input-settings-man-hours"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İş Süresi (Gün)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          data-testid="input-settings-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalConcrete"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Toplam Beton (m³)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          data-testid="input-settings-concrete"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Başlangıç Tarihi</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-settings-start-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bitiş Tarihi</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-settings-end-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proje Lokasyonu</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Örn: İstanbul, Ankara, İzmir"
                        {...field}
                        data-testid="input-settings-location"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Hava durumu bilgisi için şehir adını girin
                    </p>
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateProjectMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateProjectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Değişiklikleri Kaydet
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Work Schedule Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            İş Programı (Aylık Plan)
          </CardTitle>
          <CardDescription>
            Aylık iş programı Excel dosyasını yükleyerek planlanan miktarları içe aktarın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing schedule info */}
          {workSchedule && workSchedule.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Mevcut iş programında {workSchedule.length} kayıt var.
                Yeni dosya yüklerseniz mevcut program silinip yeni verilerle değiştirilecektir.
              </AlertDescription>
            </Alert>
          )}

          {/* File upload */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Excel dosyası formatı: İlk sütun aylar (Excel tarih formatı), diğer sütunlar imalat kalemi adları ve aylık planlanan miktarlar
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                onChange={handleWorkScheduleFileChange}
                className="hidden"
                data-testid="input-work-schedule-file"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={workScheduleMutation.isPending}
                data-testid="button-upload-work-schedule"
              >
                {workScheduleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Excel Dosyası Seç
              </Button>
              {workScheduleFile && (
                <span className="text-sm text-muted-foreground">{workScheduleFile.name}</span>
              )}
            </div>
          </div>

          {/* Upload status */}
          {uploadStatus && (
            <Alert variant={uploadStatus.success ? "default" : "destructive"}>
              {uploadStatus.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="whitespace-pre-line">
                {uploadStatus.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detailed Monthly Plan Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Detaylı Aylık İş Programı
          </CardTitle>
          <CardDescription>
            Aylık beton imalat planını (m³) bölge, imalat kalemi ve imalat kotu detayında Excel'den içe aktarın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing plan summary */}
          {detailedPlanSummary.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">Mevcut programlar: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {detailedPlanSummary.map((s) => (
                    <Badge key={`${s.year}-${s.month}`} variant="secondary">
                      {TURKISH_MONTHS[s.month - 1]} {s.year} — {s.count} kayıt
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Aynı ay için yeni dosya yüklerseniz o ayın mevcut programı silinir.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Format info */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Excel formatı: Dönem (Ay) · Bütçe Kodu Üst Öge · İmalat Ayrımı · Bütçe Kodu · İmalat Kalemi · Birim · Miktar · İmalat Bölgesi · İmalat Kotu
            </p>
            <p className="text-xs text-muted-foreground">
              Yalnızca <strong>m3</strong> birimli satırlar aktarılır. Her dosya tek bir aya ait olmalıdır.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={detailedFileInputRef}
                onChange={handleDetailedPlanFileChange}
                className="hidden"
                data-testid="input-detailed-plan-file"
              />
              <Button
                variant="outline"
                onClick={() => detailedFileInputRef.current?.click()}
                disabled={detailedPlanMutation.isPending}
                data-testid="button-upload-detailed-plan"
              >
                {detailedPlanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Excel Dosyası Seç
              </Button>
              {detailedPlanFile && (
                <span className="text-sm text-muted-foreground">{detailedPlanFile.name}</span>
              )}
            </div>
          </div>

          {/* Upload status */}
          {detailedUploadStatus && (
            <Alert variant={detailedUploadStatus.success ? "default" : "destructive"}>
              {detailedUploadStatus.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="whitespace-pre-line">
                {detailedUploadStatus.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Work Regions (İmalat Bölgesi / İmalat Kotu) Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            İmalat Bölgesi / İmalat Kotu Tanımları
          </CardTitle>
          <CardDescription>
            Projede kullanılacak geçerli İmalat Bölgesi ve İmalat Kotu kombinasyonlarını Excel'den içe aktarın.
            İmalat ilerlemesi veri girişinde bu listede olmayan bölge/kot kombinasyonları kabul edilmeyecektir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing combinations */}
          {workRegions && workRegions.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">Tanımlı kombinasyonlar ({workRegions.length}): </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {workRegions.map((r) => (
                    <Badge key={r.id} variant="secondary">
                      {r.region} / {r.imalatKotu}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Yeni dosya yüklerseniz mevcut liste silinip yeni verilerle değiştirilecektir.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* File upload */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Excel formatı: İmalat Bölgesi, İmalat Kotu (her satır geçerli bir kombinasyonu temsil eder)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={downloadWorkRegionsTemplate}
                data-testid="button-download-work-regions-template"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Şablon İndir
              </Button>
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={workRegionsFileInputRef}
                onChange={handleWorkRegionsFileChange}
                className="hidden"
                data-testid="input-work-regions-file"
              />
              <Button
                variant="outline"
                onClick={() => workRegionsFileInputRef.current?.click()}
                disabled={workRegionsMutation.isPending}
                data-testid="button-upload-work-regions"
              >
                {workRegionsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Excel Dosyası Seç
              </Button>
              {workRegionsFile && (
                <span className="text-sm text-muted-foreground">{workRegionsFile.name}</span>
              )}
            </div>
          </div>

          {/* Upload status */}
          {workRegionsUploadStatus && (
            <Alert variant={workRegionsUploadStatus.success ? "default" : "destructive"}>
              {workRegionsUploadStatus.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className="whitespace-pre-line">
                {workRegionsUploadStatus.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">Tehlikeli Alan</CardTitle>
          <CardDescription>
            Bu işlemler geri alınamaz, dikkatli olun
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" data-testid="button-delete-project">
                <Trash2 className="h-4 w-4 mr-2" />
                Projeyi Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Projeyi silmek istediğinizden emin misiniz?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bu işlem geri alınamaz. Proje ve projeye ait tüm veriler (imalat kalemleri, günlük girişler) kalıcı olarak silinecektir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteProjectMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  {deleteProjectMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Evet, Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
