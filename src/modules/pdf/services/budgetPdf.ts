import { toPng } from "html-to-image";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Service } from "../../services/types/Service";

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

// Truncates text to fit within maxWidth at the given font size.
function truncate(
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  maxWidth: number,
  size: number,
) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + "…", size) > maxWidth)
    t = t.slice(0, -1);
  return t + "…";
}

export async function createServicesPdf(services: Service[], filename: string) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const W = A4_WIDTH_POINTS;
  const H = A4_HEIGHT_POINTS;
  const MX = 36;
  const MT = 36;
  const MB = 36;
  const UW = W - MX * 2;

  const navyColor = rgb(0.082, 0.188, 0.376);
  const blueColor = rgb(0.13, 0.36, 0.78);
  const mutedColor = rgb(0.45, 0.5, 0.6);
  const lineColor = rgb(0.87, 0.89, 0.92);
  const altColor = rgb(0.97, 0.975, 1.0);
  const textColor = rgb(0.1, 0.12, 0.18);
  const greenColor = rgb(0.05, 0.44, 0.24);

  // Column widths (total = UW)
  const COL_CODE = 72;
  const COL_UNIT = 60;
  const COL_PRICE = 88;
  const COL_DESC = UW - COL_CODE - COL_UNIT - COL_PRICE;

  const X_CODE = MX;
  const X_DESC = MX + COL_CODE;
  const X_UNIT = MX + COL_CODE + COL_DESC;
  const X_PRICE = MX + COL_CODE + COL_DESC + COL_UNIT;

  const HEADER_H = 68; // page 1 logo+title block
  const TH_H = 18; // table header row
  const ROW_H = 20; // data row
  const FOOTER_H = 20; // footer area

  const firstPageRows = Math.floor(
    (H - MT - HEADER_H - TH_H - FOOTER_H - MB) / ROW_H,
  );
  const otherPageRows = Math.floor((H - MT - TH_H - FOOTER_H - MB) / ROW_H);

  const totalPages =
    services.length <= firstPageRows
      ? 1
      : 1 + Math.ceil((services.length - firstPageRows) / otherPageRows);

  // Try to embed logo
  let logoImg: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
  try {
    const res = await fetch("/MG.jpg");
    logoImg = await doc.embedJpg(await res.arrayBuffer());
  } catch {
    /* logo unavailable */
  }

  const drawTableHeader = (
    page: Awaited<ReturnType<typeof doc.addPage>>,
    y: number,
  ) => {
    page.drawRectangle({
      x: MX,
      y: y - TH_H,
      width: UW,
      height: TH_H,
      color: rgb(0.94, 0.95, 0.98),
    });
    const ty = y - TH_H + 5;
    const sz = 7.5;
    page.drawText("CÓDIGO", {
      x: X_CODE + 4,
      y: ty,
      size: sz,
      font: bold,
      color: mutedColor,
    });
    page.drawText("SERVIÇO / DESCRIÇÃO", {
      x: X_DESC + 4,
      y: ty,
      size: sz,
      font: bold,
      color: mutedColor,
    });
    page.drawText("UNIDADE", {
      x: X_UNIT + 4,
      y: ty,
      size: sz,
      font: bold,
      color: mutedColor,
    });
    page.drawText("VALOR UNIT.", {
      x: X_PRICE + 4,
      y: ty,
      size: sz,
      font: bold,
      color: mutedColor,
    });
    page.drawLine({
      start: { x: MX, y: y - TH_H },
      end: { x: W - MX, y: y - TH_H },
      thickness: 0.5,
      color: lineColor,
    });
  };

  const drawFooter = (
    page: Awaited<ReturnType<typeof doc.addPage>>,
    pageNum: number,
  ) => {
    const lineY = MB + 14;
    page.drawLine({
      start: { x: MX, y: lineY },
      end: { x: W - MX, y: lineY },
      thickness: 0.4,
      color: lineColor,
    });
    page.drawText("MG Refrigeração", {
      x: MX,
      y: MB + 4,
      size: 7,
      font: regular,
      color: mutedColor,
    });
    const pageLabel = `Página ${pageNum} de ${totalPages}`;
    const labelW = regular.widthOfTextAtSize(pageLabel, 7);
    page.drawText(pageLabel, {
      x: W - MX - labelW,
      y: MB + 4,
      size: 7,
      font: regular,
      color: mutedColor,
    });
  };

  let svcIdx = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = doc.addPage([W, H]);
    let y = H - MT;

    // Page 1 header
    if (pageNum === 1) {
      if (logoImg) {
        const lH = 48;
        const lW = logoImg.width * (lH / logoImg.height);
        page.drawImage(logoImg, { x: MX, y: y - lH, width: lW, height: lH });
        const tx = MX + lW + 14;
        page.drawText("PLANILHA DE SERVIÇOS", {
          x: tx,
          y: y - 18,
          size: 15,
          font: bold,
          color: navyColor,
        });
        page.drawText(
          `MG Refrigeração  ·  Emitida em ${new Date().toLocaleDateString("pt-BR")}`,
          { x: tx, y: y - 33, size: 8, font: regular, color: mutedColor },
        );
        page.drawText(`${services.length} serviço(s) cadastrado(s)`, {
          x: tx,
          y: y - 45,
          size: 8,
          font: regular,
          color: mutedColor,
        });
      } else {
        page.drawText("PLANILHA DE SERVIÇOS", {
          x: MX,
          y: y - 18,
          size: 15,
          font: bold,
          color: navyColor,
        });
        page.drawText(
          `MG Refrigeração  ·  Emitida em ${new Date().toLocaleDateString("pt-BR")}`,
          { x: MX, y: y - 33, size: 8, font: regular, color: mutedColor },
        );
      }
      const sepY = y - HEADER_H + 4;
      page.drawLine({
        start: { x: MX, y: sepY },
        end: { x: W - MX, y: sepY },
        thickness: 2,
        color: navyColor,
      });
      y = sepY - 4;
    }

    drawTableHeader(page, y);
    y -= TH_H;

    const rowCount = pageNum === 1 ? firstPageRows : otherPageRows;
    const endIdx = Math.min(svcIdx + rowCount, services.length);

    for (let i = svcIdx; i < endIdx; i++) {
      const svc = services[i];
      const rowY = y - ROW_H;

      if (i % 2 === 1) {
        page.drawRectangle({
          x: MX,
          y: rowY,
          width: UW,
          height: ROW_H,
          color: altColor,
        });
      }
      page.drawLine({
        start: { x: MX, y: rowY },
        end: { x: W - MX, y: rowY },
        thickness: 0.3,
        color: lineColor,
      });

      const textY = rowY + 6;
      const sz = 9;
      const price = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(svc.unitPrice);

      page.drawText(truncate(bold, svc.code, COL_CODE - 8, sz), {
        x: X_CODE + 4,
        y: textY,
        size: sz,
        font: bold,
        color: blueColor,
      });
      page.drawText(truncate(regular, svc.description, COL_DESC - 8, sz), {
        x: X_DESC + 4,
        y: textY,
        size: sz,
        font: regular,
        color: textColor,
      });
      page.drawText(truncate(regular, svc.unit, COL_UNIT - 8, sz), {
        x: X_UNIT + 4,
        y: textY,
        size: sz,
        font: regular,
        color: mutedColor,
      });
      page.drawText(truncate(bold, price, COL_PRICE - 8, sz), {
        x: X_PRICE + 4,
        y: textY,
        size: sz,
        font: bold,
        color: greenColor,
      });

      y -= ROW_H;
    }

    svcIdx = endIdx;
    drawFooter(page, pageNum);
  }

  const bytes = await doc.save();
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
