import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileSpreadsheet, Upload, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { validateWorkItems, formatValidationSummary, type WorkItemRow, type ValidationResult } from "@/lib/excelValidation";
import { ValidationResultDialog } from "./ValidationResultDialog";

const projectFormSchema = z.object({
  name: z.string().min(1, "Proje adı zorunludur"),
  description: z.string().optional(),
  plannedManHours: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  totalDuration: z.coerce.number().min(1, "İş süresi en az 1 gün olmalıdır"),
  totalConcrete: z.coerce.number().min(0, "Geçerli bir değer giriniz").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("details");
  const [workItems, setWorkItems] = useState<WorkItemRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult<WorkItemRow> | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [pendingItems, setPendingItems] = useState<WorkItemRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      plannedManHours: 0,
      totalDuration: 0,
      totalConcrete: 0,
      startDate: "",
      endDate: "",
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormValues & { workItems: WorkItemRow[] }) => {
      return await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      toast({
        title: "Proje Oluşturuldu",
        description: "Yeni proje başarıyla oluşturuldu.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
      form.reset();
      setWorkItems([]);
      setActiveTab("details");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Proje oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      const result = validateWorkItems(jsonData);
      setTotalRows(jsonData.length);
      setValidationResult(result);
      setPendingItems(result.validItems);

      if (result.errors.length > 0 || result.warnings.length > 0) {
        setShowValidation(true);
      } else if (result.validItems.length > 0) {
        applyWorkItems(result.validItems);
      } else {
        toast({
          title: "Uyarı",
          description: "Geçerli veri bulunamadı. Şablon formatını kontrol edin.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Hata",
        description: "Excel dosyası okunurken bir hata oluştu. Dosya formatını kontrol edin.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const applyWorkItems = (items: WorkItemRow[]) => {
    setWorkItems(items);
    const totalManHours = items.reduce((sum, item) => sum + item.targetManHours, 0);
    form.setValue("plannedManHours", totalManHours);
    toast({
      title: "Dosya Yüklendi",
      description: formatValidationSummary(validationResult || { validItems: items, errors: [], warnings: [] }, totalRows || items.length),
    });
    setShowValidation(false);
  };

  const handleValidationConfirm = () => {
    if (pendingItems.length > 0) {
      applyWorkItems(pendingItems);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "Bütçe Kodu": "BK-001",
        "İmalat Kalemi": "Temel Betonu",
        "Birim": "m³",
        "Hedef Miktar": 500,
        "Hedef Adam-Saat": 1000,
      },
      {
        "Bütçe Kodu": "BK-002",
        "İmalat Kalemi": "Kolon Betonu",
        "Birim": "m³",
        "Hedef Miktar": 300,
        "Hedef Adam-Saat": 600,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "İmalat Kalemleri");
    XLSX.writeFile(workbook, "imalat_kalemleri_sablonu.xlsx");
  };

  const onSubmit = (values: ProjectFormValues) => {
    createProjectMutation.mutate({ ...values, workItems });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Yeni Proje Oluştur</DialogTitle>
          <DialogDescription>
            Proje bilgilerini girerek yeni bir inşaat projesi oluşturun.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details" data-testid="tab-details">
                  Proje Detayları
                </TabsTrigger>
                <TabsTrigger value="items" data-testid="tab-items">
                  İmalat Kalemleri
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proje Adı *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Örn: Merkez Ofis Binası"
                          {...field}
                          data-testid="input-project-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Açıklama</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Proje hakkında kısa bir açıklama..."
                          {...field}
                          data-testid="input-project-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="plannedManHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Planlanan Adam-Saat *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            data-testid="input-planned-man-hours"
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
                        <FormLabel>İş Süresi (Gün) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            data-testid="input-total-duration"
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
                    name="totalConcrete"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Toplam Beton (m³)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            data-testid="input-total-concrete"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="items" className="space-y-4 mt-4">
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      Excel ile İmalat Kalemleri Yükle
                    </CardTitle>
                    <CardDescription>
                      Bütçe kodu, imalat kalemi adı, birim, hedef miktar ve hedef adam-saat bilgilerini içeren Excel dosyası yükleyin.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={downloadTemplate}
                        data-testid="button-download-template"
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Şablon İndir
                      </Button>
                      <div className="relative">
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isUploading}
                          data-testid="input-excel-upload"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Excel Yükle
                        </Button>
                      </div>
                    </div>

                    {workItems.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">
                          Yüklenen İmalat Kalemleri ({workItems.length})
                        </p>
                        <div className="max-h-48 overflow-y-auto border rounded-md">
                          <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                              <tr>
                                <th className="text-left p-2">Bütçe Kodu</th>
                                <th className="text-left p-2">İmalat Kalemi</th>
                                <th className="text-left p-2">Birim</th>
                                <th className="text-right p-2">Hedef Miktar</th>
                                <th className="text-right p-2">Hedef A-S</th>
                              </tr>
                            </thead>
                            <tbody>
                              {workItems.map((item, index) => (
                                <tr key={index} className="border-t">
                                  <td className="p-2">{item.budgetCode}</td>
                                  <td className="p-2">{item.name}</td>
                                  <td className="p-2">{item.unit}</td>
                                  <td className="p-2 text-right">{item.targetQuantity}</td>
                                  <td className="p-2 text-right">{item.targetManHours}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-create"
              >
                İptal
              </Button>
              <Button
                type="submit"
                disabled={createProjectMutation.isPending}
                data-testid="button-submit-create"
              >
                {createProjectMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Proje Oluştur
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      <ValidationResultDialog
        open={showValidation}
        onOpenChange={setShowValidation}
        result={validationResult}
        totalRows={totalRows}
        onConfirm={handleValidationConfirm}
        title="İmalat Kalemleri Doğrulama"
      />
    </Dialog>
  );
}
