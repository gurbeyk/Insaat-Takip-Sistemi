import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileSpreadsheet, Upload, Loader2, Download, Clock, TrendingUp, Trash2, Pencil, Check, X } from "lucide-react";
import * as XLSX from "xlsx";
import type { Project, WorkItem, DailyEntry } from "@shared/schema";
import { 
  validateWorkProgress, 
  validateManHours, 
  type WorkProgressRow, 
  type ManHoursRow, 
  type ValidationResult 
} from "@/lib/excelValidation";
import { ValidationResultDialog } from "./ValidationResultDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DataEntryTabProps {
  project: Project & { workItems?: WorkItem[]; dailyEntries?: DailyEntry[] };
}

function parseNotes(notes: string | null | undefined) {
  const noteStr = notes || "";
  const regionMatch = noteStr.match(/Bölge:\s*([^,]+)/);
  const ratioMatch = noteStr.match(/Oran:\s*([^,]+)/);
  let region = regionMatch ? regionMatch[1].trim() : "";
  let ratio = ratioMatch ? ratioMatch[1].trim() : "";
  
  if (!region && !ratio && noteStr.trim()) {
    ratio = noteStr.trim();
  }
  return { region, ratio };
}

export function DataEntryTab({ project }: DataEntryTabProps) {
  const { toast } = useToast();
  const [isUploadingProgress, setIsUploadingProgress] = useState(false);
  const [isUploadingManHours, setIsUploadingManHours] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult<WorkProgressRow | ManHoursRow> | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<(WorkProgressRow | ManHoursRow)[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [uploadType, setUploadType] = useState<'progress' | 'manhours'>('progress');
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ quantity: number; manHours: number; ratio: string; region: string }>({ quantity: 0, manHours: 0, ratio: "", region: "" });

  const { data: entries, isLoading: entriesLoading } = useQuery<(DailyEntry & { workItem?: WorkItem })[]>({
    queryKey: ["/api/projects", project.id, "entries"],
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (data: { entries: (WorkProgressRow | ManHoursRow)[], type: 'progress' | 'manhours' }) => {
      return await apiRequest("POST", `/api/projects/${project.id}/entries/bulk`, { 
        entries: data.entries,
        type: data.type 
      });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Toplu Veri Yüklendi",
        description: `${variables.entries.length} kayıt başarıyla eklendi.`,
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

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return await apiRequest("DELETE", `/api/entries/${entryId}`);
    },
    onSuccess: () => {
      toast({ title: "Silindi", description: "Kayıt başarıyla silindi." });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message || "Silme işlemi başarısız.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ entryId, data }: { entryId: string; data: { quantity: number; notes: string } }) => {
      return await apiRequest("PATCH", `/api/entries/${entryId}`, data);
    },
    onSuccess: () => {
      toast({ title: "Güncellendi", description: "Kayıt başarıyla güncellendi." });
      setEditingEntry(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/with-stats"] });
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message || "Güncelleme başarısız.", variant: "destructive" });
    },
  });

  const handleProgressUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingProgress(true);
    setUploadType('progress');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      const workItemMap = new Map(
        (project.workItems || []).map((item) => [item.budgetCode, item.id])
      );

      const result = validateWorkProgress(jsonData, workItemMap);
      setTotalRows(jsonData.length);
      setValidationResult(result);
      setPendingEntries(result.validItems);

      if (result.errors.length > 0 || result.warnings.length > 0) {
        setShowValidation(true);
      } else if (result.validItems.length > 0) {
        submitEntries(result.validItems, 'progress');
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
      setIsUploadingProgress(false);
      event.target.value = '';
    }
  };

  const handleManHoursUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingManHours(true);
    setUploadType('manhours');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      const workItemMap = new Map(
        (project.workItems || []).map((item) => [item.budgetCode, item.id])
      );

      const result = validateManHours(jsonData, workItemMap);
      setTotalRows(jsonData.length);
      setValidationResult(result);
      setPendingEntries(result.validItems);

      if (result.errors.length > 0 || result.warnings.length > 0) {
        setShowValidation(true);
      } else if (result.validItems.length > 0) {
        submitEntries(result.validItems, 'manhours');
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
      setIsUploadingManHours(false);
      event.target.value = '';
    }
  };

  const submitEntries = (items: (WorkProgressRow | ManHoursRow)[], type: 'progress' | 'manhours') => {
    bulkUploadMutation.mutate({ entries: items, type });
    setShowValidation(false);
  };

  const handleValidationConfirm = () => {
    if (pendingEntries.length > 0) {
      submitEntries(pendingEntries, uploadType);
    }
  };

  const downloadProgressTemplate = () => {
    const templateData = [
      {
        "Tarih": new Date().toISOString().split("T")[0],
        "Bütçe Kodu": "BK-001",
        "İmalat Kalemi": "Örnek İmalat",
        "Birim": "m3",
        "Miktar": 100,
        "Oranlar": "0.5",
        "İmalat Bölgesi": "A Blok",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "İmalat İlerlemesi");
    XLSX.writeFile(workbook, "imalat_ilerlemesi_sablonu.xlsx");
  };

  const downloadManHoursTemplate = () => {
    const templateData = [
      {
        "Tarih": new Date().toISOString().split("T")[0],
        "Bütçe Kodu": "BK-001",
        "İmalat Kalemi": "Örnek İmalat",
        "Birim": "Ad.sa",
        "Miktar": 8,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Adam-Saat");
    XLSX.writeFile(workbook, "adam_saat_sablonu.xlsx");
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

    const exportData = entries.map((entry) => {
      const { region, ratio } = parseNotes(entry.notes);
      return {
        "Tarih": entry.entryDate,
        "Bütçe Kodu": entry.workItem?.budgetCode || "",
        "İmalat Kalemi": entry.workItem?.name || "",
        "Birim": entry.workItem?.unit || "",
        "Miktar": entry.quantity,
        "Oranlar": ratio,
        "İmalat Bölgesi": region,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Günlük Veriler");
    XLSX.writeFile(workbook, `${project.name}_gunluk_veriler.xlsx`);
  };

  const startEditing = (entry: DailyEntry & { workItem?: WorkItem }) => {
    const { region, ratio } = parseNotes(entry.notes);
    setEditingEntry(entry.id);
    setEditValues({
      quantity: entry.quantity || 0,
      manHours: entry.manHours || 0,
      ratio,
      region,
    });
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditValues({ quantity: 0, manHours: 0, ratio: "", region: "" });
  };

  const saveEditing = (entryId: string) => {
    const noteParts: string[] = [];
    if (editValues.ratio) noteParts.push(`Oran: ${editValues.ratio}`);
    if (editValues.region) noteParts.push(`Bölge: ${editValues.region}`);
    
    updateMutation.mutate({
      entryId,
      data: {
        quantity: editValues.quantity,
        notes: noteParts.join(', '),
      },
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteEntryId) {
      deleteMutation.mutate(deleteEntryId);
      setDeleteEntryId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              İmalat İlerlemesi
            </CardTitle>
            <CardDescription>
              Tarih, Bütçe Kodu, İmalat Kalemi, Birim, Miktar, Oranlar, İmalat Bölgesi bilgilerini içeren Excel dosyası yükleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={downloadProgressTemplate}
                data-testid="button-download-progress-template"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Şablon İndir
              </Button>
              <label className="relative inline-block cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleProgressUpload}
                  className="sr-only"
                  disabled={isUploadingProgress || bulkUploadMutation.isPending}
                  data-testid="input-progress-upload"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isUploadingProgress || bulkUploadMutation.isPending}
                  asChild
                >
                  <span>
                    {isUploadingProgress || (bulkUploadMutation.isPending && uploadType === 'progress') ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Excel Yükle
                  </span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Adam-Saat Gerçekleşmesi
            </CardTitle>
            <CardDescription>
              Tarih, Bütçe Kodu, İmalat Kalemi, Birim (Ad.sa), Miktar bilgilerini içeren Excel dosyası yükleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={downloadManHoursTemplate}
                data-testid="button-download-manhours-template"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Şablon İndir
              </Button>
              <label className="relative inline-block cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleManHoursUpload}
                  className="sr-only"
                  disabled={isUploadingManHours || bulkUploadMutation.isPending}
                  data-testid="input-manhours-upload"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isUploadingManHours || bulkUploadMutation.isPending}
                  asChild
                >
                  <span>
                    {isUploadingManHours || (bulkUploadMutation.isPending && uploadType === 'manhours') ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Excel Yükle
                  </span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Son Girilen Veriler</CardTitle>
            <CardDescription>
              Projeye ait son 20 günlük veri girişi
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={exportEntries}
            data-testid="button-export-entries"
          >
            <Download className="h-4 w-4 mr-2" />
            Dışa Aktar
          </Button>
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
                    <TableHead>Birim</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead>Oranlar</TableHead>
                    <TableHead>İmalat Bölgesi</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, 20).map((entry) => {
                    const { region, ratio } = parseNotes(entry.notes);
                    const isEditing = editingEntry === entry.id;
                    
                    return (
                      <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                        <TableCell>
                          {new Date(entry.entryDate).toLocaleDateString("tr-TR")}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {entry.workItem?.budgetCode || "-"}
                        </TableCell>
                        <TableCell>{entry.workItem?.name || "-"}</TableCell>
                        <TableCell>{entry.workItem?.unit || "-"}</TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={editValues.quantity}
                              onChange={(e) => setEditValues({ ...editValues, quantity: Number(e.target.value) })}
                              className="w-20 text-right"
                              data-testid={`input-edit-quantity-${entry.id}`}
                            />
                          ) : (
                            entry.quantity
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isEditing ? (
                            <Input
                              type="text"
                              value={editValues.ratio}
                              onChange={(e) => setEditValues({ ...editValues, ratio: e.target.value })}
                              className="w-20"
                              data-testid={`input-edit-ratio-${entry.id}`}
                            />
                          ) : (
                            ratio || "-"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isEditing ? (
                            <Input
                              type="text"
                              value={editValues.region}
                              onChange={(e) => setEditValues({ ...editValues, region: e.target.value })}
                              className="w-24"
                              data-testid={`input-edit-region-${entry.id}`}
                            />
                          ) : (
                            region || "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => saveEditing(entry.id)}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-save-${entry.id}`}
                                >
                                  {updateMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 text-green-600" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                  data-testid={`button-cancel-${entry.id}`}
                                >
                                  <X className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => startEditing(entry)}
                                  data-testid={`button-edit-${entry.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteEntryId(entry.id)}
                                  data-testid={`button-delete-${entry.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        title={uploadType === 'progress' ? "İmalat İlerlemesi Doğrulama" : "Adam-Saat Doğrulama"}
      />

      <AlertDialog open={deleteEntryId !== null} onOpenChange={(open) => !open && setDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaydı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kaydı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} data-testid="button-confirm-delete">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
