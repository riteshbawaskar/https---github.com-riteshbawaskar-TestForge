/**
 * Client-side export utilities.
 * Word export uses the `docx` npm package.
 * Excel export uses SheetJS (xlsx).
 */
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import * as XLSX from "xlsx";
import type { TestCase, Requirement } from "../types";


// ─── Word Export ───
export async function exportToWord(requirement: Requirement, testCases: TestCase[]) {
  const sections = testCases.flatMap((tc, i) => [
    new Paragraph({
      text: `${i + 1}. ${tc.title}`,
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Priority: ${tc.priority}  |  Type: ${tc.scenario_type || "-"}  |  Format: ${tc.format}`, bold: false, color: "666666" }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: tc.content }),
    new Paragraph({ text: "" }),
  ]);

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: `Test Cases: ${requirement.title}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Requirement: ${requirement.gitlab_issue_url || ""}`, style: "aside" }),
        new Paragraph({ text: "" }),
        ...sections,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `testcases_${requirement.gitlab_issue_id || "export"}.docx`);
}


// ─── Excel Export ───

interface ManualRow {
  "#": number; "Title": string; "Priority": string; "Type": string; "Tags": string;
  "Preconditions": string; "Test Data": string; "Step #": number;
  "Action": string; "Expected Result": string;
}

function expandManual(tc: TestCase, index: number): ManualRow[] {
  let data: { preconditions?: string; test_data?: string; steps?: { action: string; expected: string }[] } = {};
  try { data = JSON.parse(tc.content); } catch {}
  const steps = data.steps?.length ? data.steps : [{ action: "", expected: "" }];
  return steps.map((s, si) => ({
    "#": index,
    "Title": tc.title,
    "Priority": tc.priority,
    "Type": tc.scenario_type || "",
    "Tags": tc.tags || "",
    "Preconditions": data.preconditions || "",
    "Test Data": data.test_data || "",
    "Step #": si + 1,
    "Action": s.action,
    "Expected Result": s.expected,
  }));
}

export function exportToExcel(requirement: Requirement, testCases: TestCase[]) {
  const wb = XLSX.utils.book_new();
  const manualTcs = testCases.filter(tc => tc.format === "MANUAL");
  const bddTcs    = testCases.filter(tc => tc.format === "BDD");

  if (manualTcs.length > 0) {
    const rows: ManualRow[] = [];
    manualTcs.forEach((tc, i) => rows.push(...expandManual(tc, i + 1)));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [5, 38, 10, 14, 20, 32, 32, 7, 45, 45].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, "Manual Test Cases");
  }

  if (bddTcs.length > 0) {
    const rows = bddTcs.map((tc, i) => ({
      "#": i + 1,
      "Title": tc.title,
      "Priority": tc.priority,
      "Type": tc.scenario_type || "",
      "Tags": tc.tags || "",
      "Content": tc.content,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [5, 38, 10, 14, 20, 80].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, "BDD Scenarios");
  }

  XLSX.writeFile(wb, `testcases_${requirement.gitlab_issue_id || "export"}.xlsx`);
}


function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
