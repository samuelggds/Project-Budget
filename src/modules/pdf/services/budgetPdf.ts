import html2pdf from "html2pdf.js";

export async function createBudgetPdf(element: HTMLElement, filename: string) {
  const worker = html2pdf()
    .set({
      margin: 0,
      filename,
      image: { type: "jpeg", quality: 1 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element);

  const blob = await worker.outputPdf("blob");
  return { blob, download: () => worker.save() };
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
