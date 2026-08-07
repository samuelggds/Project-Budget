import { toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";

const A4_WIDTH_PX = Math.ceil((210 / 25.4) * 96);
const A4_HEIGHT_PX = Math.ceil((297 / 25.4) * 96);
const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function waitForDocumentAssets(element: HTMLElement) {
  await document.fonts.ready;
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      // Embeds image as base64 so mobile browsers can render it in canvas
      if (image.src && !image.src.startsWith("data:")) {
        try {
          image.src = await toDataUrl(image.src);
        } catch {
          // keep original src if fetch fails
        }
      }
    }),
  );
}

export async function createBudgetPdf(
  element: HTMLElement,
  filename: string,
  { fillPage = false } = {},
) {
  await waitForDocumentAssets(element);

  const contentHeight = Math.max(A4_HEIGHT_PX, element.scrollHeight);
  const imageData = await toPng(element, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
    width: A4_WIDTH_PX,
    height: contentHeight,
    style: {
      width: `${A4_WIDTH_PX}px`,
      minWidth: `${A4_WIDTH_PX}px`,
      maxWidth: `${A4_WIDTH_PX}px`,
      minHeight: `${A4_HEIGHT_PX}px`,
      height: `${contentHeight}px`,
      margin: "0",
      transform: "none",
      transformOrigin: "top left",
      boxShadow: "none",
      overflow: "visible",
    },
  });

  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([A4_WIDTH_POINTS, A4_HEIGHT_POINTS]);
  const image = await pdfDocument.embedPng(imageData);

  let drawWidth: number;
  let drawHeight: number;
  let drawX: number;
  let drawY: number;

  if (fillPage) {
    drawWidth = page.getWidth();
    drawHeight = page.getHeight();
    drawX = 0;
    drawY = 0;
  } else {
    const scale = Math.min(
      page.getWidth() / image.width,
      page.getHeight() / image.height,
    );
    drawWidth = image.width * scale;
    drawHeight = image.height * scale;
    drawX = (page.getWidth() - drawWidth) / 2;
    drawY = (page.getHeight() - drawHeight) / 2;
  }

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });

  const bytes = await pdfDocument.save();
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  return { blob, download: () => downloadPdfBlob(blob, filename) };
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Navegadores móveis podem terminar o download depois do evento de clique.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
