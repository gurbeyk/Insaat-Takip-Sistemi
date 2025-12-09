import { z } from "zod";

export interface ValidationError {
  row: number;
  field: string;
  value: unknown;
  message: string;
}

export interface ValidationResult<T> {
  validItems: T[];
  errors: ValidationError[];
  warnings: string[];
}

const workItemRowSchema = z.object({
  budgetCode: z.string().min(1, "Bütçe kodu boş olamaz"),
  name: z.string().min(1, "İmalat kalemi adı boş olamaz"),
  unit: z.string().min(1, "Birim boş olamaz"),
  targetQuantity: z.number().min(0, "Hedef miktar 0'dan küçük olamaz"),
  targetManHours: z.number().min(0, "Hedef adam-saat 0'dan küçük olamaz"),
});

export type WorkItemRow = z.infer<typeof workItemRowSchema>;

const dailyEntryRowSchema = z.object({
  workItemId: z.string().min(1, "İmalat kalemi seçilmeli"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD formatında olmalı"),
  manHours: z.number().min(0, "Adam-saat 0'dan küçük olamaz"),
  quantity: z.number().min(0, "Miktar 0'dan küçük olamaz"),
  notes: z.string().optional(),
});

export type DailyEntryRow = z.infer<typeof dailyEntryRowSchema>;

export interface WorkProgressRow {
  workItemId: string;
  entryDate: string;
  quantity: number;
  ratio?: string;
  region?: string;
}

export interface ManHoursRow {
  workItemId: string;
  entryDate: string;
  manHours: number;
}

export function validateWorkItems(
  jsonData: Record<string, unknown>[]
): ValidationResult<WorkItemRow> {
  const validItems: WorkItemRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (jsonData.length === 0) {
    warnings.push("Excel dosyası boş veya okunamadı.");
    return { validItems, errors, warnings };
  }

  const firstRow = jsonData[0];
  const expectedColumns = ["Bütçe Kodu", "İmalat Kalemi", "Birim", "Hedef Miktar", "Hedef Adam-Saat"];
  const alternativeColumns = ["budgetCode", "name", "unit", "targetQuantity", "targetManHours"];
  
  const hasExpectedColumns = expectedColumns.some(col => col in firstRow);
  const hasAlternativeColumns = alternativeColumns.some(col => col in firstRow);
  
  if (!hasExpectedColumns && !hasAlternativeColumns) {
    warnings.push(
      "Excel dosyasında beklenen sütunlar bulunamadı. Beklenen sütunlar: " +
      expectedColumns.join(", ")
    );
  }

  const seenBudgetCodes = new Set<string>();

  jsonData.forEach((row, index) => {
    const rowNum = index + 2;

    const budgetCodeRaw = row["Bütçe Kodu"] ?? row["budgetCode"] ?? "";
    const nameRaw = row["İmalat Kalemi"] ?? row["name"] ?? "";
    const unitRaw = row["Birim"] ?? row["unit"] ?? "";
    const targetQuantityRaw = row["Hedef Miktar"] ?? row["targetQuantity"];
    const targetManHoursRaw = row["Hedef Adam-Saat"] ?? row["targetManHours"];

    const budgetCode = String(budgetCodeRaw).trim();
    const name = String(nameRaw).trim();
    const unit = String(unitRaw).trim();
    const targetQuantity = parseNumberSafe(targetQuantityRaw, "Hedef Miktar", rowNum, errors);
    const targetManHours = parseNumberSafe(targetManHoursRaw, "Hedef Adam-Saat", rowNum, errors);

    if (!budgetCode) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCodeRaw,
        message: "Bütçe kodu boş olamaz",
      });
      return;
    }

    if (!name) {
      errors.push({
        row: rowNum,
        field: "İmalat Kalemi",
        value: nameRaw,
        message: "İmalat kalemi adı boş olamaz",
      });
      return;
    }

    if (!unit) {
      errors.push({
        row: rowNum,
        field: "Birim",
        value: unitRaw,
        message: "Birim boş olamaz",
      });
      return;
    }

    if (targetQuantity === null || targetManHours === null) {
      return;
    }

    if (seenBudgetCodes.has(budgetCode)) {
      warnings.push(`Satır ${rowNum}: "${budgetCode}" bütçe kodu tekrar ediyor, son değer kullanılacak.`);
    }
    seenBudgetCodes.add(budgetCode);

    validItems.push({
      budgetCode,
      name,
      unit,
      targetQuantity,
      targetManHours,
    });
  });

  return { validItems, errors, warnings };
}

export function validateWorkProgress(
  jsonData: Record<string, unknown>[],
  workItemMap: Map<string, string>
): ValidationResult<WorkProgressRow> {
  const validItems: WorkProgressRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (jsonData.length === 0) {
    warnings.push("Excel dosyası boş veya okunamadı.");
    return { validItems, errors, warnings };
  }

  const firstRow = jsonData[0];
  const expectedColumns = ["Tarih", "Bütçe Kodu", "İmalat Kalemi", "Birim", "Miktar"];
  
  const hasExpectedColumns = expectedColumns.some(col => col in firstRow);
  
  if (!hasExpectedColumns) {
    warnings.push(
      "Excel dosyasında beklenen sütunlar bulunamadı. Beklenen sütunlar: " +
      expectedColumns.join(", ")
    );
  }

  const availableBudgetCodes = Array.from(workItemMap.keys());

  jsonData.forEach((row, index) => {
    const rowNum = index + 2;

    const entryDateRaw = row["Tarih"] ?? row["entryDate"] ?? "";
    const budgetCodeRaw = row["Bütçe Kodu"] ?? row["budgetCode"] ?? "";
    const quantityRaw = row["Miktar"] ?? row["quantity"];
    const ratioRaw = row["Oranlar"] ?? row["ratio"] ?? "";
    const regionRaw = row["İmalat Bölgesi"] ?? row["region"] ?? "";

    const budgetCode = String(budgetCodeRaw).trim();
    const workItemId = workItemMap.get(budgetCode);

    if (!budgetCode) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCodeRaw,
        message: "Bütçe kodu boş olamaz",
      });
      return;
    }

    if (!workItemId) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCode,
        message: `"${budgetCode}" bütçe kodu bu projede tanımlı değil. Mevcut kodlar: ${availableBudgetCodes.slice(0, 5).join(", ")}${availableBudgetCodes.length > 5 ? "..." : ""}`,
      });
      return;
    }

    const entryDate = parseDateSafe(entryDateRaw, rowNum, errors);
    if (!entryDate) return;

    const quantity = parseNumberSafe(quantityRaw, "Miktar", rowNum, errors);

    if (quantity === null) return;

    if (quantity === 0) {
      warnings.push(`Satır ${rowNum}: Miktar değeri sıfır, kayıt yoksayılıyor.`);
      return;
    }

    validItems.push({
      workItemId,
      entryDate,
      quantity,
      ratio: String(ratioRaw).trim() || undefined,
      region: String(regionRaw).trim() || undefined,
    });
  });

  return { validItems, errors, warnings };
}

export function validateManHours(
  jsonData: Record<string, unknown>[],
  workItemMap: Map<string, string>
): ValidationResult<ManHoursRow> {
  const validItems: ManHoursRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (jsonData.length === 0) {
    warnings.push("Excel dosyası boş veya okunamadı.");
    return { validItems, errors, warnings };
  }

  const firstRow = jsonData[0];
  const expectedColumns = ["Tarih", "Bütçe Kodu", "İmalat Kalemi", "Birim", "Miktar"];
  
  const hasExpectedColumns = expectedColumns.some(col => col in firstRow);
  
  if (!hasExpectedColumns) {
    warnings.push(
      "Excel dosyasında beklenen sütunlar bulunamadı. Beklenen sütunlar: " +
      expectedColumns.join(", ")
    );
  }

  const availableBudgetCodes = Array.from(workItemMap.keys());

  jsonData.forEach((row, index) => {
    const rowNum = index + 2;

    const entryDateRaw = row["Tarih"] ?? row["entryDate"] ?? "";
    const budgetCodeRaw = row["Bütçe Kodu"] ?? row["budgetCode"] ?? "";
    const manHoursRaw = row["Miktar"] ?? row["manHours"];

    const budgetCode = String(budgetCodeRaw).trim();
    const workItemId = workItemMap.get(budgetCode);

    if (!budgetCode) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCodeRaw,
        message: "Bütçe kodu boş olamaz",
      });
      return;
    }

    if (!workItemId) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCode,
        message: `"${budgetCode}" bütçe kodu bu projede tanımlı değil. Mevcut kodlar: ${availableBudgetCodes.slice(0, 5).join(", ")}${availableBudgetCodes.length > 5 ? "..." : ""}`,
      });
      return;
    }

    const entryDate = parseDateSafe(entryDateRaw, rowNum, errors);
    if (!entryDate) return;

    const manHours = parseNumberSafe(manHoursRaw, "Miktar (Adam-Saat)", rowNum, errors);

    if (manHours === null) return;

    if (manHours === 0) {
      warnings.push(`Satır ${rowNum}: Adam-saat değeri sıfır, kayıt yoksayılıyor.`);
      return;
    }

    validItems.push({
      workItemId,
      entryDate,
      manHours,
    });
  });

  return { validItems, errors, warnings };
}

export function validateDailyEntries(
  jsonData: Record<string, unknown>[],
  workItemMap: Map<string, string>
): ValidationResult<DailyEntryRow> {
  const validItems: DailyEntryRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (jsonData.length === 0) {
    warnings.push("Excel dosyası boş veya okunamadı.");
    return { validItems, errors, warnings };
  }

  const firstRow = jsonData[0];
  const expectedColumns = ["Bütçe Kodu", "Tarih", "Adam-Saat", "Miktar"];
  const alternativeColumns = ["budgetCode", "entryDate", "manHours", "quantity"];
  
  const hasExpectedColumns = expectedColumns.some(col => col in firstRow);
  const hasAlternativeColumns = alternativeColumns.some(col => col in firstRow);
  
  if (!hasExpectedColumns && !hasAlternativeColumns) {
    warnings.push(
      "Excel dosyasında beklenen sütunlar bulunamadı. Beklenen sütunlar: " +
      expectedColumns.join(", ")
    );
  }

  const availableBudgetCodes = Array.from(workItemMap.keys());

  jsonData.forEach((row, index) => {
    const rowNum = index + 2;

    const budgetCodeRaw = row["Bütçe Kodu"] ?? row["budgetCode"] ?? "";
    const entryDateRaw = row["Tarih"] ?? row["entryDate"] ?? "";
    const manHoursRaw = row["Adam-Saat"] ?? row["manHours"];
    const quantityRaw = row["Miktar"] ?? row["quantity"];
    const notesRaw = row["Notlar"] ?? row["notes"] ?? "";

    const budgetCode = String(budgetCodeRaw).trim();
    const workItemId = workItemMap.get(budgetCode);

    if (!budgetCode) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCodeRaw,
        message: "Bütçe kodu boş olamaz",
      });
      return;
    }

    if (!workItemId) {
      errors.push({
        row: rowNum,
        field: "Bütçe Kodu",
        value: budgetCode,
        message: `"${budgetCode}" bütçe kodu bu projede tanımlı değil. Mevcut kodlar: ${availableBudgetCodes.slice(0, 5).join(", ")}${availableBudgetCodes.length > 5 ? "..." : ""}`,
      });
      return;
    }

    const entryDate = parseDateSafe(entryDateRaw, rowNum, errors);
    if (!entryDate) return;

    const manHours = parseNumberSafe(manHoursRaw, "Adam-Saat", rowNum, errors);
    const quantity = parseNumberSafe(quantityRaw, "Miktar", rowNum, errors);

    if (manHours === null || quantity === null) return;

    if (manHours === 0 && quantity === 0) {
      warnings.push(`Satır ${rowNum}: Adam-saat ve miktar değerleri sıfır, kayıt yoksayılıyor.`);
      return;
    }

    validItems.push({
      workItemId,
      entryDate,
      manHours,
      quantity,
      notes: String(notesRaw).trim(),
    });
  });

  return { validItems, errors, warnings };
}

function parseNumberSafe(
  value: unknown,
  field: string,
  row: number,
  errors: ValidationError[]
): number | null {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) {
    errors.push({
      row,
      field,
      value,
      message: `"${value}" geçerli bir sayı değil`,
    });
    return null;
  }

  if (numValue < 0) {
    errors.push({
      row,
      field,
      value,
      message: `${field} değeri 0'dan küçük olamaz`,
    });
    return null;
  }

  return numValue;
}

function parseDateSafe(
  value: unknown,
  row: number,
  errors: ValidationError[]
): string | null {
  if (!value) {
    errors.push({
      row,
      field: "Tarih",
      value,
      message: "Tarih boş olamaz",
    });
    return null;
  }

  let dateStr = String(value).trim();

  if (typeof value === "number") {
    const excelDate = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(excelDate.getTime())) {
      return excelDate.toISOString().split("T")[0];
    }
  }

  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const trMatch = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (trMatch) {
    const day = trMatch[1].padStart(2, "0");
    const month = trMatch[2].padStart(2, "0");
    const year = trMatch[3];
    return `${year}-${month}-${day}`;
  }

  const trMatch2 = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);
  if (trMatch2) {
    const day = trMatch2[1].padStart(2, "0");
    const month = trMatch2[2].padStart(2, "0");
    const year = "20" + trMatch2[3];
    return `${year}-${month}-${day}`;
  }

  errors.push({
    row,
    field: "Tarih",
    value: dateStr,
    message: `"${dateStr}" geçerli bir tarih formatı değil. Beklenen format: GG.AA.YYYY veya YYYY-MM-DD`,
  });
  return null;
}

export function formatValidationSummary(
  result: ValidationResult<unknown>,
  totalRows: number
): string {
  const parts: string[] = [];
  
  if (result.validItems.length > 0) {
    parts.push(`${result.validItems.length}/${totalRows} kayıt başarıyla işlendi.`);
  }
  
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} satırda hata bulundu.`);
  }
  
  if (result.warnings.length > 0) {
    parts.push(`${result.warnings.length} uyarı var.`);
  }
  
  return parts.join(" ");
}
