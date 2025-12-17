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
  parentBudgetCode: z.string().optional(),
  category: z.string().optional(),
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

    const parentBudgetCodeRaw = row["Bütçe Kodu Üst Öge"] ?? row["Butce kodu ust oge"] ?? row["parentBudgetCode"] ?? "";
    const categoryRaw = row["İmalat Ayrımı"] ?? row["Imalat Ayrimi"] ?? row["category"] ?? "";
    const budgetCodeRaw = row["Bütçe Kodu"] ?? row["budgetCode"] ?? "";
    const nameRaw = row["İmalat Kalemi"] ?? row["name"] ?? "";
    const unitRaw = row["Birim"] ?? row["unit"] ?? "";
    const targetQuantityRaw = row["Hedef Miktar"] ?? row["targetQuantity"];
    const targetManHoursRaw = row["Hedef Adam-Saat"] ?? row["targetManHours"];

    const parentBudgetCode = String(parentBudgetCodeRaw).trim() || undefined;
    const category = String(categoryRaw).trim() || undefined;
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
      parentBudgetCode,
      category,
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

// Work Schedule (İş Programı) validation
export interface WorkScheduleRow {
  workItemName: string;
  year: number;
  month: number;
  plannedQuantity: number;
}

// Monthly man-hours data from work schedule
export interface MonthlyManHoursRow {
  year: number;
  month: number;
  plannedManHours: number;
}

// Extended result for work schedule validation
export interface WorkScheduleValidationResult extends ValidationResult<WorkScheduleRow> {
  monthlyManHours: MonthlyManHoursRow[];
}

// Month names mapping (Turkish and English)
// Note: "mar" maps to March (3), "may" maps to May (5) - shared between languages
const monthNames: Record<string, number> = {
  // Turkish months
  "ocak": 1, "oca": 1,
  "şubat": 2, "şub": 2,
  "mart": 3,
  "nisan": 4, "nis": 4,
  "mayıs": 5,
  "haziran": 6, "haz": 6,
  "temmuz": 7, "tem": 7,
  "ağustos": 8, "ağu": 8,
  "eylül": 9, "eyl": 9,
  "ekim": 10, "eki": 10,
  "kasım": 11, "kas": 11,
  "aralık": 12, "ara": 12,
  // English months
  "january": 1, "jan": 1,
  "february": 2, "feb": 2,
  "march": 3, "mar": 3,
  "april": 4, "apr": 4,
  "may": 5,
  "june": 6, "jun": 6,
  "july": 7, "jul": 7,
  "august": 8, "aug": 8,
  "september": 9, "sep": 9,
  "october": 10, "oct": 10,
  "november": 11, "nov": 11,
  "december": 12, "dec": 12,
};

function expandYear(yearStr: string): number {
  const year = parseInt(yearStr, 10);
  if (year < 100) {
    // Two-digit year: 24 -> 2024, 99 -> 1999
    return year >= 0 && year <= 50 ? 2000 + year : 1900 + year;
  }
  return year;
}

function parseMonthDate(dateValue: unknown): { year: number; month: number } | null {
  if (dateValue === null || dateValue === undefined || dateValue === "") {
    return null;
  }

  // Handle Excel date serial number
  if (typeof dateValue === "number") {
    // Excel date serial: days since 1899-12-30
    // A value like 45292 would be a date in 2024
    if (dateValue > 1000) {
      const date = new Date((dateValue - 25569) * 86400 * 1000);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
    return null;
  }

  if (typeof dateValue !== "string") {
    return null;
  }

  // Use Turkish locale for proper case folding of Turkish characters (İ/ı, I/i)
  const str = String(dateValue).trim().toLocaleLowerCase('tr-TR');
  
  // Skip common header values
  if (str === "aylar" || str === "ay" || str === "month" || str === "tarih" || str === "date") {
    return null;
  }

  // Try ISO format: YYYY-MM or YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[./-](\d{1,2})/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1], 10), month: parseInt(isoMatch[2], 10) };
  }

  // Try MM/YYYY or MM-YYYY or MM.YYYY (4-digit year)
  const mmYYYYMatch = str.match(/^(\d{1,2})[./-](\d{4})$/);
  if (mmYYYYMatch) {
    return { year: parseInt(mmYYYYMatch[2], 10), month: parseInt(mmYYYYMatch[1], 10) };
  }

  // Try MM/YY or MM-YY or MM.YY (2-digit year)
  const mmYYMatch = str.match(/^(\d{1,2})[./-](\d{2})$/);
  if (mmYYMatch) {
    const month = parseInt(mmYYMatch[1], 10);
    const year = expandYear(mmYYMatch[2]);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  // Try Turkish month names with various patterns
  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    // "Ocak 2025" or "Ocak 25" or "Ocak-2025" or "Ocak-25"
    const pattern1 = new RegExp(`^${monthName}[\\s-]*(\\d{2,4})$`, "i");
    const match1 = str.match(pattern1);
    if (match1) {
      return { year: expandYear(match1[1]), month: monthNum };
    }
    // "2025 Ocak" or "25 Ocak" or "2025-Ocak" or "25-Ocak"
    const pattern2 = new RegExp(`^(\\d{2,4})[\\s-]*${monthName}$`, "i");
    const match2 = str.match(pattern2);
    if (match2) {
      return { year: expandYear(match2[1]), month: monthNum };
    }
  }

  return null;
}

export function validateWorkSchedule(
  jsonData: unknown[][]
): WorkScheduleValidationResult {
  const validItems: WorkScheduleRow[] = [];
  const monthlyManHours: MonthlyManHoursRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (!jsonData || jsonData.length < 2) {
    warnings.push("Excel dosyası boş veya yeterli veri içermiyor.");
    return { validItems, errors, warnings, monthlyManHours };
  }

  // First row is headers: ["Aylar", "Grobeton", "Temel", "Ustyapi", "Adam saat", ...]
  const headers = jsonData[0] as (string | number | null)[];
  
  if (!headers || headers.length < 2) {
    errors.push({
      row: 1,
      field: "Başlık",
      value: headers,
      message: "İş programı en az 2 sütun içermeli (Aylar + İmalat Kalemi)",
    });
    return { validItems, errors, warnings, monthlyManHours };
  }

  // Find "Adam saat" column index (case-insensitive, Turkish locale)
  let manHoursColumnIndex = -1;
  const manHoursPatterns = ["adam saat", "adamsaat", "adam-saat", "man hours", "manhours"];
  
  // Extract work item names from headers (skip first column which is "Aylar" and "Adam saat" column)
  const workItemNames: string[] = [];
  const workItemColumnIndices: number[] = [];
  
  for (let i = 1; i < headers.length; i++) {
    const name = headers[i];
    if (name && String(name).trim()) {
      const headerNormalized = String(name).trim().toLocaleLowerCase('tr-TR');
      
      // Check if this is the man-hours column
      if (manHoursPatterns.some(p => headerNormalized.includes(p))) {
        manHoursColumnIndex = i;
      } else {
        workItemNames.push(String(name).trim());
        workItemColumnIndices.push(i);
      }
    }
  }

  if (workItemNames.length === 0) {
    errors.push({
      row: 1,
      field: "Başlık",
      value: headers,
      message: "En az bir imalat kalemi başlığı bulunamadı.",
    });
    return { validItems, errors, warnings, monthlyManHours };
  }

  let skippedRows = 0;
  const unparsedRows: { row: number; value: unknown }[] = [];

  // Process data rows (starting from row 1)
  for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex] as (number | string | null)[];
    const rowNum = rowIndex + 1; // Excel row number (1-indexed)

    if (!row || row.length === 0) continue;

    const dateValue = row[0];
    
    // Skip completely empty first cell
    if (dateValue === null || dateValue === undefined || dateValue === "") {
      continue;
    }
    
    const parsed = parseMonthDate(dateValue);

    // If we can't parse the date, track it for reporting
    if (!parsed) {
      skippedRows++;
      unparsedRows.push({ row: rowNum, value: dateValue });
      continue;
    }

    const { year, month } = parsed;

    // Validate year and month range
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      skippedRows++;
      continue;
    }

    // Process man-hours column if present
    if (manHoursColumnIndex >= 0) {
      const manHoursValue = row[manHoursColumnIndex];
      if (manHoursValue !== null && manHoursValue !== undefined && manHoursValue !== "") {
        let plannedManHours: number = 0;
        if (typeof manHoursValue === "number") {
          plannedManHours = manHoursValue;
        } else {
          // Handle formatted numbers: 
          // - Turkish format: "24.133" (dots as thousands) or "24,5" (comma as decimal)
          // - International format: "24,133" (comma as thousands) or "24.5" (dot as decimal)
          let cleanedValue = String(manHoursValue).replace(/\s/g, '');
          
          // If there's both comma and dot, determine which is the decimal separator
          if (cleanedValue.includes(',') && cleanedValue.includes('.')) {
            // Last separator is likely the decimal
            const lastComma = cleanedValue.lastIndexOf(',');
            const lastDot = cleanedValue.lastIndexOf('.');
            if (lastComma > lastDot) {
              // Comma is decimal separator (European: 24.133,50)
              cleanedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
            } else {
              // Dot is decimal separator (US: 24,133.50)
              cleanedValue = cleanedValue.replace(/,/g, '');
            }
          } else if (cleanedValue.includes(',')) {
            // Only comma - could be thousands or decimal
            // If comma appears once and has 1-2 digits after, treat as decimal
            const parts = cleanedValue.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
              cleanedValue = cleanedValue.replace(',', '.');
            } else {
              // Comma as thousands separator
              cleanedValue = cleanedValue.replace(/,/g, '');
            }
          }
          // Dots with no comma are treated as-is (standard decimal or thousands)
          
          const parsedNum = parseFloat(cleanedValue);
          if (!isNaN(parsedNum)) {
            plannedManHours = parsedNum;
          }
        }
        if (plannedManHours > 0) {
          monthlyManHours.push({ year, month, plannedManHours });
        }
      }
    }

    // Process each work item column
    for (let colIndex = 0; colIndex < workItemNames.length; colIndex++) {
      const workItemName = workItemNames[colIndex];
      const quantityValue = row[workItemColumnIndices[colIndex]]; // Use stored column index

      // Skip null/empty values
      if (quantityValue === null || quantityValue === undefined || quantityValue === "") {
        continue;
      }

      let plannedQuantity: number;
      if (typeof quantityValue === "number") {
        plannedQuantity = quantityValue;
      } else {
        const parsedNum = parseFloat(String(quantityValue).replace(",", "."));
        if (isNaN(parsedNum)) {
          errors.push({
            row: rowNum,
            field: workItemName,
            value: quantityValue,
            message: `"${quantityValue}" geçerli bir sayı değil`,
          });
          continue;
        }
        plannedQuantity = parsedNum;
      }

      if (plannedQuantity < 0) {
        errors.push({
          row: rowNum,
          field: workItemName,
          value: plannedQuantity,
          message: "Planlanan miktar negatif olamaz",
        });
        continue;
      }

      // Only add if quantity > 0 (skip zero values)
      if (plannedQuantity > 0) {
        validItems.push({
          workItemName,
          year,
          month,
          plannedQuantity,
        });
      }
    }
  }

  // Add warnings about skipped rows
  if (skippedRows > 0) {
    const exampleRows = unparsedRows.slice(0, 3).map(r => `Satır ${r.row}: "${r.value}"`).join(", ");
    warnings.push(`${skippedRows} satır tarih formatı tanınamadığı için atlandı (${exampleRows}). Beklenen format: Excel tarih, 01/24, YYYY-MM, veya "Ocak 2025".`);
  }

  if (validItems.length === 0 && errors.length === 0) {
    if (warnings.length === 0) {
      warnings.push("İş programında geçerli veri bulunamadı.");
    }
  }

  // Add info about man-hours column detection
  if (manHoursColumnIndex >= 0 && monthlyManHours.length > 0) {
    warnings.push(`Adam saat sütunu tespit edildi: ${monthlyManHours.length} aylık planlanan adam saat verisi bulundu.`);
  }

  return { validItems, errors, warnings, monthlyManHours };
}
