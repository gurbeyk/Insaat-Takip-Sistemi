import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ValidationError, ValidationResult } from "@/lib/excelValidation";

interface ValidationResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ValidationResult<unknown> | null;
  totalRows: number;
  onConfirm?: () => void;
  title?: string;
}

export function ValidationResultDialog({
  open,
  onOpenChange,
  result,
  totalRows,
  onConfirm,
  title = "Doğrulama Sonuçları",
}: ValidationResultDialogProps) {
  if (!result) return null;

  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const hasValidItems = result.validItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasErrors ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">
                Toplam: {totalRows} satır
              </Badge>
              <Badge 
                variant="default" 
                className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
              >
                Geçerli: {result.validItems.length}
              </Badge>
              {hasErrors && (
                <Badge variant="destructive">
                  Hatalı: {result.errors.length}
                </Badge>
              )}
              {hasWarnings && (
                <Badge 
                  variant="default"
                  className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                >
                  Uyarı: {result.warnings.length}
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {hasErrors && (
              <div className="space-y-2">
                <h4 className="font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Hatalar
                </h4>
                <div className="space-y-1">
                  {result.errors.slice(0, 20).map((error, idx) => (
                    <ErrorRow key={idx} error={error} />
                  ))}
                  {result.errors.length > 20 && (
                    <p className="text-sm text-muted-foreground pl-4">
                      ...ve {result.errors.length - 20} hata daha
                    </p>
                  )}
                </div>
              </div>
            )}

            {hasWarnings && (
              <div className="space-y-2">
                <h4 className="font-medium text-orange-600 dark:text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Uyarılar
                </h4>
                <div className="space-y-1">
                  {result.warnings.slice(0, 10).map((warning, idx) => (
                    <div
                      key={idx}
                      className="text-sm text-muted-foreground pl-4 py-1 border-l-2 border-orange-300 dark:border-orange-600"
                    >
                      {warning}
                    </div>
                  ))}
                  {result.warnings.length > 10 && (
                    <p className="text-sm text-muted-foreground pl-4">
                      ...ve {result.warnings.length - 10} uyarı daha
                    </p>
                  )}
                </div>
              </div>
            )}

            {!hasErrors && !hasWarnings && hasValidItems && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>Tüm veriler başarıyla doğrulandı!</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          {hasValidItems && onConfirm && (
            <Button onClick={onConfirm} disabled={result.validItems.length === 0}>
              {hasErrors
                ? `${result.validItems.length} Geçerli Kaydı Yükle`
                : "Tümünü Yükle"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorRow({ error }: { error: ValidationError }) {
  return (
    <div className="text-sm pl-4 py-1 border-l-2 border-destructive/50">
      <span className="font-medium">Satır {error.row}</span>
      <span className="text-muted-foreground"> - </span>
      <span className="text-muted-foreground">{error.field}: </span>
      <span className="text-destructive">{error.message}</span>
      {error.value !== undefined && error.value !== "" && (
        <span className="text-muted-foreground text-xs ml-1">
          (değer: "{String(error.value)}")
        </span>
      )}
    </div>
  );
}
