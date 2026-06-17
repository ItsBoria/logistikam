// Loads the Heebo TTF and registers it on a jsPDF instance so Hebrew renders.
import HeeboUrl from "@/assets/fonts/Heebo.ttf?url";
import type jsPDF from "jspdf";

let cached: string | null = null;

async function loadHeeboBase64(): Promise<string> {
  if (cached) return cached;
  const res = await fetch(HeeboUrl);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  cached = btoa(binary);
  return cached;
}

export async function attachHeebo(pdf: jsPDF) {
  const b64 = await loadHeeboBase64();
  pdf.addFileToVFS("Heebo.ttf", b64);
  pdf.addFont("Heebo.ttf", "Heebo", "normal");
  pdf.addFont("Heebo.ttf", "Heebo", "bold");
  pdf.setFont("Heebo", "normal");
}
