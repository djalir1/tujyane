import { jsPDF } from 'jspdf';
import tujyaneLogoUrl from '@/assets/tujyane-logo.png';

/**
 * TUJYANE trip receipt.
 *
 * Layout follows the "Trip Receipt / Booking Confirmation" brand template:
 * wide logo lockup + trip-id pill in the header, date/status row, a route
 * card with pin→car→pin, a 3×2 details grid, a payment card with a green
 * "Total" pill, and a brand footer band. Rendered on A5 portrait so the
 * template fits without cramping.
 *
 * Vector-only (jsPDF primitives) for the icons, so the PDF stays under
 * 100 KB even with the embedded logo.
 */

export type ReceiptData = {
  receiptNumber: string;
  issuedAt: Date;
  travelledAt: Date;
  origin: string;
  destination: string;
  driverName: string;
  driverVerified: boolean;
  vehicleMakeModel: string;
  vehicleYear: number | null;
  vehiclePlate: string;
  vehicleEnergyType: string;
  seats: number;
  contributionAmount: number;
  contributionPerSeat?: number | null;
  passengerNote?: string | null;
  currency?: 'RWF';
  passengerName: string;
  /** Human-readable status label. Defaults to "Confirmed". */
  status?: string;
};

export async function downloadReceiptPdf(r: ReceiptData): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl().catch(() => null);
  const doc = buildReceiptPdf(r, logoDataUrl ?? undefined);
  doc.save(`TUJYANE-receipt-${r.receiptNumber}.pdf`);
}

/**
 * Fetches the wide TUJYANE logo, downscales it to a receipt-appropriate size
 * (max 480px wide) and re-encodes as PNG. jsPDF stores raw pixels, so a 1774×887
 * source turns into a ~4.5 MB PDF while a 480×240 render bakes down to <200 KB
 * with no visible loss at print resolution.
 */
async function loadLogoDataUrl(): Promise<string> {
  const res = await fetch(tujyaneLogoUrl);
  const blob = await res.blob();
  const imageBitmap = await createImageBitmap(blob).catch(() => null);
  if (!imageBitmap) {
    // Fallback: return original data URL.
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }
  const maxW = 480;
  const scale = Math.min(1, maxW / imageBitmap.width);
  const w = Math.max(1, Math.round(imageBitmap.width * scale));
  const h = Math.max(1, Math.round(imageBitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.drawImage(imageBitmap, 0, 0, w, h);
  imageBitmap.close?.();
  return canvas.toDataURL('image/png');
}

/* ────────────────────────────────  colours  ──────────────────────────────── */

const NAVY:  [number, number, number] = [12, 45, 92];
const NAVY2: [number, number, number] = [22, 62, 118];
const BRAND: [number, number, number] = [46, 158, 58];
const BRAND_DARK: [number, number, number] = [30, 120, 42];
const BLUE_PIN: [number, number, number] = [26, 82, 155];
const INK:   [number, number, number] = [24, 36, 52];
const MUTED: [number, number, number] = [117, 132, 152];
const HAIR:  [number, number, number] = [220, 228, 240];
const CARD_BG: [number, number, number] = [237, 244, 249];
const PILL_SOFT: [number, number, number] = [222, 239, 226];

export function buildReceiptPdf(r: ReceiptData, logoDataUrl?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait', compress: true });
  const W = 148, H = 210;
  const M = 10;

  /* ── Header: logo lockup left, receipt title + trip-id pill right ── */
  const headerBottom = 36;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', M, 6, 60, 30); } catch { drawLogoFallback(doc, M, 6); }
  } else {
    drawLogoFallback(doc, M, 6);
  }

  // Right column: TRIP RECEIPT / BOOKING CONFIRMATION
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleY = 14;
  const titleRightX = W - M;
  const title = 'TRIP RECEIPT';
  doc.text(title, titleRightX, titleY, { align: 'right', charSpace: 0.9 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('BOOKING CONFIRMATION', titleRightX, titleY + 4.6, { align: 'right', charSpace: 0.5 });

  // Trip ID pill
  const pillW = 44, pillH = 11, pillX = titleRightX - pillW, pillY = titleY + 7.5;
  doc.setFillColor(...PILL_SOFT);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.25);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'S');
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Trip ID', pillX + 3, pillY + 4);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`#${r.receiptNumber}`, pillX + 3, pillY + 9);

  /* ── Date & Time · Status row ── */
  let y = headerBottom + 4;
  drawCalendarIcon(doc, M, y - 3.5, 5.5);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Date & Time', M + 8, y - 0.5);
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(fmtHumanDateTime(r.travelledAt), M + 8, y + 4);

  // Divider
  const midX = W / 2 + 4;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.line(midX - 6, y - 2, midX - 6, y + 5);

  // Status: green check + label + value
  drawCheckCircle(doc, midX, y - 3.5, 5);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Status', midX + 8, y - 0.5);
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(r.status ?? 'Confirmed', midX + 8, y + 4);

  y += 12;

  /* ── ROUTE card ── */
  const routeH = 32;
  doc.setFillColor(...CARD_BG);
  doc.roundedRect(M, y, W - 2 * M, routeH, 3, 3, 'F');
  doc.setTextColor(...MUTED);
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.text('ROUTE', M + 4, y + 5, { charSpace: 0.8 });

  const { primary: originName, secondary: originSub } = splitPlace(r.origin);
  const { primary: destName,   secondary: destSub   } = splitPlace(r.destination);
  const leftX  = M + 12;
  const rightX = W - M - 12;
  const rowY = y + 15;

  drawMapPin(doc, M + 5, rowY - 3, 5, BRAND, true);
  drawMapPin(doc, W - M - 10, rowY - 3, 5, BLUE_PIN, false);

  // Origin
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(clip(doc, originName, 44), leftX, rowY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (originSub) doc.text(clip(doc, originSub, 44), leftX, rowY + 4);
  doc.setFontSize(7);
  doc.text('(Departure)', leftX, rowY + 8.5);

  // Destination (right aligned)
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(clip(doc, destName, 44), rightX, rowY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (destSub) doc.text(clip(doc, destSub, 44), rightX, rowY + 4, { align: 'right' });
  doc.setFontSize(7);
  doc.text('(Arrival)', rightX, rowY + 8.5, { align: 'right' });

  // Dashed connector + car icon
  const connectorY = rowY - 1;
  const connectorLeft  = leftX + 32;
  const connectorRight = rightX - 32;
  drawDashed(doc, connectorLeft, connectorY, connectorRight, connectorY, BRAND, 1.4);
  const carCX = (connectorLeft + connectorRight) / 2;
  // Erase a small chunk under the car for cleanliness
  doc.setFillColor(...CARD_BG);
  doc.rect(carCX - 4.2, connectorY - 3.2, 8.4, 6, 'F');
  drawCarIcon(doc, carCX - 4, connectorY - 3, 8);

  y += routeH + 6;

  /* ── Details grid (3 rows × 2 columns) ── */
  const colGap = 8;
  const colW = (W - 2 * M - colGap) / 2;
  const rowH = 14;

  detailCell(doc, M,            y,           colW, 'Passenger',
             r.passengerName + (r.passengerNote ? `  ${r.passengerNote}` : ''),
             (dx, dy) => drawPersonIcon(doc, dx, dy, 6));
  detailCell(doc, M + colW + colGap, y,      colW, 'Driver',
             r.driverName,
             (dx, dy) => drawPersonIcon(doc, dx, dy, 6),
             { verifiedBadge: r.driverVerified });

  detailCell(doc, M,            y + rowH,    colW, 'Vehicle',
             `${r.vehicleMakeModel}${r.vehicleYear ? ` ${r.vehicleYear}` : ''}`,
             (dx, dy) => drawCarSmallIcon(doc, dx, dy, 7),
             { pill: r.vehiclePlate, valueFontSize: 9 });
  detailCell(doc, M + colW + colGap, y + rowH, colW, 'Seats',
             String(r.seats),
             (dx, dy) => drawSeatsIcon(doc, dx, dy, 7));

  detailCell(doc, M,            y + 2 * rowH, colW, 'Energy',
             cap(r.vehicleEnergyType) + (r.vehicleEnergyType === 'electric' ? '  (EV)' : ''),
             (dx, dy) => drawLeafIcon(doc, dx, dy, 6));
  detailCell(doc, M + colW + colGap, y + 2 * rowH, colW, 'Route',
             `${short(originName)}  »  ${short(destName)}`,
             (dx, dy) => drawRoadIcon(doc, dx, dy, 6));

  y += 3 * rowH + 2;

  // Divider
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 6;

  /* ── PAYMENT DETAILS card ── */
  const showBreakdown = r.seats > 1;
  const perSeat = r.contributionPerSeat && r.contributionPerSeat > 0
    ? r.contributionPerSeat
    : (r.seats > 0 ? Math.round(r.contributionAmount / r.seats) : r.contributionAmount);
  const payH = showBreakdown ? 40 : 34;

  doc.setFillColor(...CARD_BG);
  doc.roundedRect(M, y, W - 2 * M, payH, 3, 3, 'F');

  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PAYMENT DETAILS', M + 4, y + 6, { charSpace: 0.8 });

  const payLineY0 = y + 13;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Contribution', M + 4, payLineY0);
  const amtR = W - M - 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`RWF ${formatNumber(r.contributionAmount)}`, amtR, payLineY0, { align: 'right' });

  if (showBreakdown) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(8);
    doc.text(`${r.seats} seats × RWF ${formatNumber(perSeat)}`, M + 4, payLineY0 + 5);
  }

  // Divider inside card
  const inCardDivY = y + payH - 15;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.25);
  doc.line(M + 4, inCardDivY, W - M - 4, inCardDivY);

  // Total row + green pill
  const totalY = y + payH - 6;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total', M + 4, totalY);

  const totalStr = `RWF ${formatNumber(r.contributionAmount)}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const totalW = doc.getTextWidth(totalStr) + 10;
  const totalPillH = 10;
  const totalPillX = W - M - 4 - totalW;
  const totalPillY = totalY - totalPillH + 2.8;
  doc.setFillColor(...BRAND);
  doc.roundedRect(totalPillX, totalPillY, totalW, totalPillH, 5, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(totalStr, totalPillX + totalW / 2, totalY, { align: 'center' });

  y += payH + 6;

  /* ── Footer ──
     "Thank you" copy left, "Rwanda moves together" italic-serif right,
     brand wave band along the bottom edge. */
  const footerTop = H - 26;
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Thank you for riding with Tujyane!', M, footerTop);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Together we make travel easier and more affordable.', M, footerTop + 4);

  // "Rwanda moves together" — jsPDF has no cursive; times italic reads as elegant.
  doc.setFont('times', 'italic');
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_DARK);
  const cursive = 'Rwanda moves together';
  doc.text(cursive, W - M, footerTop + 3, { align: 'right' });
  // Green underline swoosh
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.5);
  const cw = doc.getTextWidth(cursive);
  doc.line(W - M - cw + 4, footerTop + 5, W - M - 2, footerTop + 5);

  // Brand wave: green low + navy high, drawn as filled polygons
  drawBottomWave(doc, W, H);

  return doc;
}

/* ────────────────────────────────  cells  ──────────────────────────────── */

function detailCell(
  doc: jsPDF, x: number, y: number, w: number,
  label: string, value: string,
  drawIcon: (x: number, y: number) => void,
  opts?: { pill?: string; verifiedBadge?: boolean; valueFontSize?: number },
) {
  const iconSize = 7;
  drawIcon(x, y + 1);
  const textX = x + iconSize + 3;
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(label, textX, y + 3);

  // Pre-measure pill so the value's available width matches reality.
  let pillW = 0;
  if (opts?.pill) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    pillW = doc.getTextWidth(opts.pill) + 4;
  }
  const badgeW = opts?.verifiedBadge ? 5 : 0;
  const availW = w - (textX - x) - (pillW ? pillW + 2 : 0) - badgeW;

  const valueFontSize = opts?.valueFontSize ?? 10;
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(valueFontSize);
  const clipped = clip(doc, value, availW);
  doc.text(clipped, textX, y + 8);

  const valW = doc.getTextWidth(clipped);

  if (opts?.pill && pillW) {
    const px = textX + valW + 2;
    const py = y + 4.8;
    const ph = 4.6;
    doc.setFillColor(...PILL_SOFT);
    doc.roundedRect(px, py, pillW, ph, 2.3, 2.3, 'F');
    doc.setTextColor(...BRAND_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(opts.pill, px + pillW / 2, py + 3.2, { align: 'center' });
  }
  if (opts?.verifiedBadge) {
    // Small green check circle after the driver name.
    drawCheckCircle(doc, textX + valW + 1.5, y + 4.6, 3.6);
  }
}

/* ────────────────────────────────  icons  ──────────────────────────────── */

function drawCalendarIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y + size * 0.15, size, size * 0.8, 0.6, 0.6, 'S');
  doc.line(x, y + size * 0.4, x + size, y + size * 0.4);
  doc.line(x + size * 0.25, y, x + size * 0.25, y + size * 0.25);
  doc.line(x + size * 0.75, y, x + size * 0.75, y + size * 0.25);
}

function drawCheckCircle(doc: jsPDF, x: number, y: number, size: number) {
  const r = size / 2;
  doc.setFillColor(...BRAND);
  doc.circle(x + r, y + r, r, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.55);
  doc.line(x + r - 1.3, y + r + 0.1, x + r - 0.2, y + r + 1.1);
  doc.line(x + r - 0.2, y + r + 1.1, x + r + 1.5, y + r - 1.2);
}

function drawMapPin(doc: jsPDF, x: number, y: number, size: number, color: [number, number, number], filledDot: boolean) {
  const r = size / 2.4;
  const cx = x + r;
  const cy = y + r;
  doc.setFillColor(...color);
  doc.circle(cx, cy, r, 'F');
  // Stem
  doc.triangle(cx - r * 0.6, cy + r * 0.5, cx + r * 0.6, cy + r * 0.5, cx, cy + r * 1.8, 'F');
  // Inner dot
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r * 0.45, 'F');
  if (filledDot) { doc.setFillColor(...color); doc.circle(cx, cy, r * 0.2, 'F'); }
}

function drawCarIcon(doc: jsPDF, x: number, y: number, size: number) {
  const h = size * 0.55;
  const bodyY = y + size * 0.2;
  doc.setFillColor(...BRAND);
  // Roof
  doc.roundedRect(x + size * 0.22, bodyY, size * 0.56, h * 0.55, 1, 1, 'F');
  // Body
  doc.roundedRect(x, bodyY + h * 0.4, size, h * 0.6, 1.2, 1.2, 'F');
  // Wheels
  doc.setFillColor(...NAVY);
  doc.circle(x + size * 0.22, bodyY + h + 0.4, 0.9, 'F');
  doc.circle(x + size * 0.78, bodyY + h + 0.4, 0.9, 'F');
}

function drawCarSmallIcon(doc: jsPDF, x: number, y: number, size: number) {
  drawCarIcon(doc, x, y, size);
}

function drawPersonIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.45);
  const cx = x + size / 2;
  doc.circle(cx, y + size * 0.3, size * 0.22, 'S');
  // Shoulders — small arc drawn with an ellipse clipped by leaving stroke only
  const shW = size * 0.85;
  const shH = size * 0.55;
  doc.ellipse(cx, y + size * 0.95, shW / 2, shH / 2, 'S');
}

function drawSeatsIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  const r = size * 0.19;
  const c1x = x + size * 0.3, c2x = x + size * 0.7;
  const cy = y + size * 0.32;
  doc.circle(c1x, cy, r, 'S');
  doc.circle(c2x, cy, r, 'S');
  doc.ellipse(x + size * 0.5, y + size * 0.9, size * 0.5, size * 0.35, 'S');
}

function drawLeafIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.45);
  // Simple leaf: draw a filled ovoid oriented diagonally
  doc.setFillColor(...BRAND);
  const cx = x + size * 0.55, cy = y + size * 0.45;
  doc.ellipse(cx, cy, size * 0.42, size * 0.22, 'F');
  // Vein
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(cx - size * 0.35, cy + 0.1, cx + size * 0.35, cy - 0.4);
  // Stem
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.45);
  doc.line(x + size * 0.12, y + size * 0.95, x + size * 0.35, y + size * 0.55);
}

function drawRoadIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  // Trapezoid road perspective: draw two converging lines
  doc.line(x + size * 0.15, y + size, x + size * 0.42, y);
  doc.line(x + size * 0.85, y + size, x + size * 0.58, y);
  // Dashed midline
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.line(x + size * 0.5, y + size, x + size * 0.5, y);
  doc.setLineDashPattern([], 0);
}

function drawDashed(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, color: [number, number, number], width: number) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
}

function drawLogoFallback(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(...BRAND);
  doc.circle(x + 6, y + 6, 6, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TUJYANE', x + 15, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_DARK);
  doc.text('Share the ride. Split the cost.', x + 15, y + 12);
}

function drawBottomWave(doc: jsPDF, W: number, H: number) {
  // Navy layer (top of the band)
  doc.setFillColor(...NAVY);
  doc.triangle(0, H - 8, W, H - 4, W, H, 'F');
  doc.triangle(0, H - 8, 0, H, W, H, 'F');
  // Brand green underneath, a shallower diagonal
  doc.setFillColor(...BRAND);
  doc.triangle(0, H - 4, W * 0.7, H, 0, H, 'F');
  // Darker navy at the very bottom-right for depth
  doc.setFillColor(...NAVY2);
  doc.triangle(W * 0.7, H, W, H, W, H - 2, 'F');
}

/* ────────────────────────────────  utils  ──────────────────────────────── */

function fmtHumanDateTime(d: Date): string {
  const day = d.getDate().toString().padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${mon} ${year}  ·  ${time}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Take everything before the first em-dash / hyphen / comma as the primary. */
function splitPlace(s: string): { primary: string; secondary: string } {
  const cut = s.split(/\s*[—–,]\s*/, 2);
  if (cut.length === 2) return { primary: cut[0].trim(), secondary: cut[1].trim() };
  return { primary: s.trim(), secondary: '' };
}

function short(s: string): string {
  return s.length > 20 ? s.slice(0, 19) + '…' : s;
}

function clip(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s;
  let cut = s;
  while (cut.length > 1 && doc.getTextWidth(cut + '…') > maxW) cut = cut.slice(0, -1);
  return cut + '…';
}

export function receiptNumberFromBookingId(id: string): string {
  const clean = id.replace(/-/g, '');
  return `TJ-${clean.slice(0, 6).toUpperCase()}`;
}
