import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileSpreadsheet, Plus, Upload, Loader2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import type { Project, WorkItem, DailyEntry } from "@shared/schema";
import { validateDailyEntries, formatValidationSummary, type DailyEntryRow, type ValidationResult } from "@/lib/excelValidation";
import { ValidationResultDialog } from "./ValidationResultDialog";

const dailyEntrySchema = z.object({
  workItemId: z.string().min(1, "İmalat kalemi seçiniz"),
  entryDate: z.string().min(1, "Tarih seçiniz"),
  manHours: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  quantity: z.coerce.number().min(0, "Geçerli bir değer giriniz"),
  notes: z.string().optional(),
});

type DailyEntryFormValues = z.infer<typeof dailyEntrySchema>;

interface DataEntryTabProps {
  project: Project & { workItems?: WorkItem[]; dailyEntries?: DailyEntry[] };
}

export function DataEntryTab({ project }: DataEntryTabProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult<DailyEntryRow> | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<DailyEntryRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const { data: entries, isLoading: entriesLoading } = useQuery<(DailyEntry & { workItem?: WorkItem })[]>({
    queryKey: ["/api/projects", project.id, "entries"],
  });

  const form = useForm<DailyEntryFormValues>({
    resolver: zodResolver(dailyEntrySchema),
    defaultValues: {
      workItemId: "",
      entryDate: new Date().toISOString().split("T")[0],
      manHours: 0,
      quantity: 0,
      notes: "",
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data: DailyEntryFormValues) => {
      return await apiRequest("POST", `/api/projects/${project.id}/entries`, data);
    },
    onSuccess: () => {
      toast({
        title: "Veri Kaydedildi",
        description: "Günlük veri başarıyla eklendi.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
      form.reset({
        workItemId: "",
        entryDate: new Date().toISOString().split("T")[0],
        manHours: 0,
        quantity: 0,
        notes: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Veri eklenirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (data: DailyEntryFormValues[]) => {
      return await apiRequest("POST", `/api/projects/${project.id}/entries/bulk`, { entries: data });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Toplu Veri Yüklendi",
        description: `${variables.length} kayıt başarıyla eklendi.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Toplu veri yüklenirken bir hata oluştu.",
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

      const workItemMap = new Map(
        (project.workItems || []).map((item) => [item.budgetCode, item.id])
      );

      const result = validateDailyEntries(jsonData, workItemMap);
      setTotalRows(jsonData.length);
      setValidationResult(result);
      setPendingEntries(result.validItems);

      if (result.errors.length > 0 || result.warnings.length > 0) {
        setShowValidation(true);
      } else if (result.validItems.length > 0) {
        submitEntries(result.validItems);
      } else {
        toast({
          title: "Uyarı",
          description: "Geçerli veri bulunamadı. Bütçe kodlarını ve tarih formatlarını kontrol edin.",
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

  const submitEntries = (items: DailyEntryRow[]) => {
    bulkUploadMutation.mutate(items);
    setShowValidation(false);
  };

  const handleValidationConfirm = () => {
    if (pendingEntries.length > 0) {
      submitEntries(pendingEntries);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "Bütçe Kodu": "BK-001",
        "Tarih": new Date().toISOString().split("T")[0],
        "Adam-Saat": 8,
        "Miktar": 10,
        "Notlar": "Örnek not",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Günlük Veri");
    XLSX.writeFile(workbook, "gunluk_veri_sablonu.xlsx");
  };

  const exportEntries = () => {
    if (!entries || entries.length === 0) {
      toast({
        title: "Uyarı",
        description: "Dışa aktarılacak veri bulunamadı.",
        variant: "destructive",
      });
      return;
    }

    const exportData = entries.map((entry) => ({
      "Bütçe Kodu": entry.workItem?.budgetCode || "",
      "İmalat Kalemi": entry.workItem?.name || "",
      "Tarih": entry.entryDate,
      "Adam-Saat": entry.manHours,
      "Miktar": entry.quantity,
      "Notlar": entry.notes || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Günlük Veriler");
    XLSX.writeFile(workbook, `${project.name}_gunluk_veriler.xlsx`);
  };

  const onSubmit = (values: DailyEntryFormValues) => {
    createEntryMutation.mutate(values);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Günlük Veri Girişi
            </CardTitle>
            <CardDescription>
              Adam-saat ve metraj bilgilerini tek tek girin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="workItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İmalat Kalemi *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-work-item">
                            <SelectValue placeholder="İmalat kalemi seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(project.workItems || []).map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.budgetCode} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="entryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarih *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-entry-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="manHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adam-Saat *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.5"
                            {...field}
                            data-testid="input-man-hours"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Miktar *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            data-testid="input-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notlar</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ek notlar..."
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createEntryMutation.isPending}
                  data-testid="button-submit-entry"
                >
                  {createEntryMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Kaydet
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Excel ile Toplu Veri Girişi
            </CardTitle>
            <CardDescription>
              Bütçe kodu, tarih, adam-saat ve miktar bilgilerini içeren Excel dosyası yükleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={downloadTemplate}
                data-testid="button-download-entry-template"
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
                  disabled={isUploading || bulkUploadMutation.isPending}
                  data-testid="input-bulk-upload"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isUploading || bulkUploadMutation.isPending}
                >
                  {isUploading || bulkUploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Excel Yükle
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={exportEntries}
                className="w-full"
                data-testid="button-export-entries"
              >
                <Download className="h-4 w-4 mr-2" />
                Mevcut Verileri Dışa Aktar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Son Girilen Veriler</CardTitle>
          <CardDescription>
            Projeye ait son 20 günlük veri girişi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : entries && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Bütçe Kodu</TableHead>
                    <TableHead>İmalat Kalemi</TableHead>
                    <TableHead className="text-right">Adam-Saat</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead>Notlar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, 20).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {new Date(entry.entryDate).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {entry.workItem?.budgetCode}
                      </TableCell>
                      <TableCell>{entry.workItem?.name}</TableCell>
                      <TableCell className="text-right">{entry.manHours}</TableCell>
                      <TableCell className="text-right">{entry.quantity}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[200px]">
                        {entry.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Henüz veri girişi yapılmamış
            </p>
          )}
        </CardContent>
      </Card>

      <ValidationResultDialog
        open={showValidation}
        onOpenChange={setShowValidation}
        result={validationResult}
        totalRows={totalRows}
        onConfirm={handleValidationConfirm}
        title="Günlük Veri Doğrulama"
      />
    </div>
  );
}
