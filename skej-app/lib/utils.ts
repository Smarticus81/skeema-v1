import * as XLSX from "xlsx";
import { ScheduleItem } from "./api";

export function exportToExcel(items: ScheduleItem[], filename: string = "schedule") {
  const data = items.map((item) => ({
    "PSUR/PMSR ID": item.id,
    "Product Name": item.product,
    "Class": item.class,
    "Type": item.type,
    "Start Period": item.start,
    "End Period": item.end,
    "Frequency": item.frequency,
    "Due Date": item.due,
    "Status": item.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");

  // Set column widths
  worksheet["!cols"] = [
    { wch: 15 }, // ID
    { wch: 40 }, // Product
    { wch: 8 },  // Class
    { wch: 15 }, // Type
    { wch: 12 }, // Start
    { wch: 12 }, // End
    { wch: 12 }, // Frequency
    { wch: 12 }, // Due
    { wch: 15 }, // Status
  ];

  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(workbook, `${filename}_${date}.xlsx`);
}

