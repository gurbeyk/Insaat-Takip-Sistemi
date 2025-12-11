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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { validateWorkSchedule, formatValidationSummary } from "@/lib/excelValidation";
import type { Project, MonthlyWorkItemSchedule } from "@shared/schema";

const projectSettingsSchema = z.object({
  name: z.string().min(1, "Proje adı zorunludur"),
  description: z.string().optional(),
  plannedManHours: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  totalDuration: z.coerce.number().min(1, "İş süresi en az 1 gün olmalıdır"),
  totalConcrete: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  status: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type ProjectSettingsFormValues = z.infer<typeof projectSettingsSchema>;

interface ProjectSettingsTabProps {
  project: Project;
}

export function ProjectSettingsTab({ project }: ProjectSettingsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workScheduleFile, setWorkScheduleFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch existing work schedule
  const { data: workSchedule } = useQuery<MonthlyWorkItemSchedule[]>({
    queryKey: [`/api/projects/${project.id}/work-schedule`],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
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

  // Work schedule upload mutation
  const workScheduleMutation = useMutation({
    mutationFn: async (items: { workItemName: string; year: number; month: number; plannedQuantity: number }[]) => {
      return await apiRequest("POST", `/api/projects/${project.id}/work-schedule/bulk`, { items });
    },
    onSuccess: () => {
      setUploadStatus({ success: true, message: "İş programı başarıyla yüklendi." });
      setWorkScheduleFile(null);
      toast({
        title: "İş Programı Yüklendi",
        description: "İş programı başarıyla içe aktarıldı.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/work-schedule`] });
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
      workScheduleMutation.mutate(result.validItems);
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
