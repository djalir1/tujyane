import { jsPDF } from 'jspdf';
// The real TUJYANE logo shipped as a static asset. Vite hashes the URL for
// production builds. We fetch it at PDF-generation time and embed as a data
// URL so the PDF stays self-contained (works offline / when shared).
import tujyaneLogoUrl from '@/assets/tujyane-logo.png';

export type ReceiptData = {
  receiptNumber: string;      // short human-friendly id like "TJ-4F2A9C"
  issuedAt: Date;             // "printed at" timestamp
  travelledAt: Date;          // departure_time
  origin: string;
  destination: string;
  driverName: string;
  driverVerified: boolean;
  vehicleMakeModel: string;   // "BYD Atto 3"
  vehicleYear: number | null;
  vehiclePlate: string;
  vehicleEnergyType: string;  // 'petrol' | 'electric' | ...
  seats: number;
  contributionAmount: number; // total paid for the trip
  /** Optional: contribution charged per seat. If provided (and > 0), the
   * receipt renders a small line "N × RF X = TOTAL" so a multi-seat booking
   * makes sense at a glance. Left optional so old callers don't break. */
  contributionPerSeat?: number | null;
  /** Optional: additional passenger info to print under the passenger name
   * (e.g. "+ 1 companion"). Kept short — one line, ~40 chars. */
  passengerNote?: string | null;
  currency?: 'RWF';
  passengerName: string;
};

/**
 * Generates a compact A6 (105×148mm) receipt PDF and triggers a download.
 * Client-side only — no server round-trip. Embeds the real TUJYANE logo
 * (fetched from the bundled asset and inlined as base64) so the PDF is
 * self-contained.
 */
export async function downloadReceiptPdf(r: ReceiptData): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl().catch(() => null);
  const doc = buildReceiptPdf(r, logoDataUrl ?? undefined);
  doc.save(`TUJYANE-receipt-${r.receiptNumber}.pdf`);
}

async function loadLogoDataUrl(): Promise<string> {
  const res = await fetch(tujyaneLogoUrl);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * Same as downloadReceiptPdf but returns the jsPDF document instead of
 * saving. Useful for tests and for generating a proof PDF from a script.
 * `logoDataUrl` is optional — when omitted, the vector fallback mark is drawn.
 */
export function buildReceiptPdf(r: ReceiptData, logoDataUrl?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [105, 148], orientation: 'portrait' });

  // Palette
  const navy: [number, number, number] = [11, 30, 64];
  const brand: [number, number, number] = [46, 158, 58];
  const ink: [number, number, number] = [17, 24, 39];
  const muted: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [226, 232, 240];
  const bgSoft: [number, number, number] = [245, 247, 250];

  const W = 105;
  const H = 148;
  const M = 8;                 // page margin
  let y = 0;

  // ── Header band ─────────────────────────────────────────────
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 22, 'F');
  if (logoDataUrl) {
    // Real logo, embedded from the bundled asset. A 12×12 mm chip on the
    // dark header — the image is anti-aliased by jsPDF and holds up at print.
    try {
      doc.addImage(logoDataUrl, 'PNG', M + 1, 5, 12, 12);
    } catch {
      drawLogoMark(doc, M + 2, 6, 10);
    }
  } else {
    drawLogoMark(doc, M + 2, 6, 10);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('TUJYANE', M + 15, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Share the ride. Split the cost.', M + 15, 18);

  y = 30;
  doc.setTextColor(...muted);
  doc.setFontSize(7);
  doc.text('RECEIPT', M, y);
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`#${r.receiptNumber}`, M, y + 5);

  const issued = fmtDate(r.issuedAt);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  const w = doc.getTextWidth(issued);
  doc.text('ISSUED', W - M - w, y);
  doc.setTextColor(...ink);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const w2 = doc.getTextWidth(issued);
  doc.text(issued, W - M - w2, y + 5);

  y += 11;
  doc.setDrawColor(...line);
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);

  // ── Route ───────────────────────────────────────────────────
  y += 6;
  doc.setTextColor(...muted);
  doc.setFontSize(7);
  doc.text('ROUTE', M, y);

  y += 4;
  const routeH = 22;
  doc.setFillColor(...bgSoft);
  doc.roundedRect(M, y, W - 2 * M, routeH, 2, 2, 'F');

  // origin dot + text
  const dotX = M + 4;
  const dotY1 = y + 6;
  const dotY2 = y + 15;
  doc.setFillColor(...brand);
  doc.circle(dotX, dotY1, 1.3, 'F');
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.5);
  doc.line(dotX, dotY1 + 1.5, dotX, dotY2 - 1.5);
  doc.setFillColor(255, 255, 255);
  doc.circle(dotX, dotY2, 1.3, 'F');
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.8);
  doc.circle(dotX, dotY2, 1.3, 'S');

  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(clip(doc, r.origin, W - 2 * M - 10), dotX + 4, dotY1 + 1.2);
  doc.text(clip(doc, r.destination, W - 2 * M - 10), dotX + 4, dotY2 + 1.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text(fmtDate(r.travelledAt), dotX + 4, y + routeH - 3);

  y += routeH + 6;

  // ── Passenger + Driver ──────────────────────────────────────
  const colW = (W - 2 * M) / 2 - 3;
  labelValue(doc, M,             y, colW, 'PASSENGER',
             r.passengerName + (r.passengerNote ? `\n${r.passengerNote}` : ''), ink, muted);
  labelValue(doc, M + colW + 6,  y, colW, 'DRIVER',
             r.driverName + (r.driverVerified ? '  ✓' : ''), ink, muted);

  y += 12;
  labelValue(doc, M,             y, colW, 'VEHICLE',
             `${r.vehicleMakeModel}${r.vehicleYear ? ` · ${r.vehicleYear}` : ''}`, ink, muted);
  labelValue(doc, M + colW + 6,  y, colW, 'PLATE', r.vehiclePlate, ink, muted);

  y += 12;
  labelValue(doc, M,             y, colW, 'ENERGY',
             cap(r.vehicleEnergyType) + (r.vehicleEnergyType === 'electric' ? ' ⚡' : ''), ink, muted);
  labelValue(doc, M + colW + 6,  y, colW, 'SEATS', String(r.seats), ink, muted);

  y += 12;
  doc.setDrawColor(...line);
  doc.line(M, y, W - M, y);

  // ── Contribution ────────────────────────────────────────────
  y += 6;
  // Multi-seat: show per-seat × seats = total in a small breakdown line
  // above the big total. For a 1-seat booking, only the total shows.
  const perSeat = r.contributionPerSeat && r.contributionPerSeat > 0
    ? r.contributionPerSeat
    : (r.seats > 0 ? Math.round(r.contributionAmount / r.seats) : r.contributionAmount);
  const showBreakdown = r.seats > 1;
  const boxH = showBreakdown ? 22 : 18;

  doc.setFillColor(...navy);
  doc.roundedRect(M, y, W - 2 * M, boxH, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('CONTRIBUTION', M + 4, y + 5);

  if (showBreakdown) {
    // Small line, then the big total.
    doc.setFontSize(7);
    doc.text(
      `${r.seats} seats × RF ${formatNumber(perSeat)}`,
      M + 4, y + 10,
    );
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const money = `RF ${formatNumber(r.contributionAmount)}`;
  const mw = doc.getTextWidth(money);
  doc.text(money, W - M - 4 - mw, y + boxH - 5);

  y += boxH + 6;

  // ── Thank-you ───────────────────────────────────────────────
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Murakoze — thank you for riding.', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text('This receipt is a demo record. No money was collected by TUJYANE;', M, y + 3);
  doc.text('contributions are settled between passenger and driver.', M, y + 6);

  // Footer strip
  doc.setDrawColor(...line);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setTextColor(...muted);
  doc.setFontSize(6);
  doc.text('tujyane.rw — Rwanda\'s carpool network', M, H - 6);
  const url = 'v1 · demo';
  const uw = doc.getTextWidth(url);
  doc.text(url, W - M - uw, H - 6);

  return doc;
}

/* ---- helpers ---- */

function labelValue(
  doc: jsPDF, x: number, y: number, w: number,
  label: string, value: string,
  inkColor: [number, number, number], mutedColor: [number, number, number],
) {
  doc.setTextColor(...mutedColor);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(label, x, y);
  doc.setTextColor(...inkColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(clip(doc, value, w), x, y + 4.5);
}

function drawLogoMark(doc: jsPDF, x: number, y: number, size: number) {
  // Rounded white chip
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, size, size, 1.5, 1.5, 'F');
  // Green circle
  doc.setFillColor(46, 158, 58);
  doc.circle(x + size / 2, y + size / 2, size / 2 - 1.4, 'F');
  // Location pin
  doc.setFillColor(255, 255, 255);
  const cx = x + size / 2;
  const cy = y + size / 2 - 0.3;
  doc.circle(cx, cy, 1.2, 'F');
  // Little dot inside
  doc.setFillColor(46, 158, 58);
  doc.circle(cx, cy, 0.5, 'F');
}

function fmtDate(d: Date): string {
  const day = d.getDate().toString().padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${mon} ${year} · ${time}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function clip(doc: jsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s;
  let cut = s;
  while (cut.length > 1 && doc.getTextWidth(cut + '…') > maxW) cut = cut.slice(0, -1);
  return cut + '…';
}

/** Small helper: generate a short receipt id from a booking uuid. */
export function receiptNumberFromBookingId(id: string): string {
  const clean = id.replace(/-/g, '');
  return `TJ-${clean.slice(0, 6).toUpperCase()}`;
}
