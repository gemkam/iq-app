import type { Company } from "./types";

// How quotations and invoices look (per company). Saved in companies.pdf_template.
export type PdfTemplate = {
  style: "classic" | "modern" | "minimal" | "bold";
  primary: string;
  accent: string;
  font: "sans" | "serif" | "rounded";
  logo_url: string;
  logo_size: number;
  logo_pos: "left" | "right" | "center";
  show: {
    name_ar: boolean;
    cr: boolean;
    vatin: boolean;
    address: boolean;
    phone: boolean;
    email: boolean;
    sno: boolean;
    unit: boolean;
    rate: boolean;
    notes: boolean;
    terms: boolean;
    bank: boolean;
    signatures: boolean;
    watermark: boolean;
  };
  quotation_title: string;
  invoice_title: string;
  tax_invoice_title: string;
  sign_left: string;
  sign_right: string;
  footer_text: string;
  bank: { name: string; holder: string; account: string; iban: string };
  stamp_url: string;
  signature_url: string;
};

export const DEFAULT_TEMPLATE: PdfTemplate = {
  style: "classic",
  primary: "#0b1730",
  accent: "#e11d48",
  font: "sans",
  logo_url: "",
  logo_size: 64,
  logo_pos: "left",
  show: {
    name_ar: true,
    cr: true,
    vatin: true,
    address: true,
    phone: true,
    email: true,
    sno: true,
    unit: true,
    rate: true,
    notes: true,
    terms: true,
    bank: false,
    signatures: true,
    watermark: false,
  },
  quotation_title: "QUOTATION",
  invoice_title: "INVOICE",
  tax_invoice_title: "TAX INVOICE",
  sign_left: "For {company}",
  sign_right: "Received / Accepted by",
  footer_text: "",
  bank: { name: "", holder: "", account: "", iban: "" },
  stamp_url: "",
  signature_url: "",
};

export function templateOf(company: Pick<Company, "logo_url"> & { pdf_template?: Partial<PdfTemplate> | null }): PdfTemplate {
  const t = (company.pdf_template || {}) as Partial<PdfTemplate>;
  return {
    ...DEFAULT_TEMPLATE,
    ...t,
    logo_url: t.logo_url ?? company.logo_url ?? "",
    show: { ...DEFAULT_TEMPLATE.show, ...(t.show || {}) },
    bank: { ...DEFAULT_TEMPLATE.bank, ...(t.bank || {}) },
  };
}

export const FONTS: Record<PdfTemplate["font"], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  rounded: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif',
};

export const COLOR_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Navy & Red", primary: "#0b1730", accent: "#e11d48" },
  { name: "Royal Blue", primary: "#1d4ed8", accent: "#0891b2" },
  { name: "Emerald", primary: "#065f46", accent: "#d97706" },
  { name: "Charcoal", primary: "#1f2937", accent: "#f59e0b" },
  { name: "Maroon & Gold", primary: "#7f1d1d", accent: "#b45309" },
  { name: "Purple", primary: "#4c1d95", accent: "#db2777" },
  { name: "Teal", primary: "#0f766e", accent: "#0369a1" },
  { name: "Black", primary: "#000000", accent: "#525252" },
];
