export type ReceiptTemplate = {
  accentColor: string;
  logoPosition: "left" | "center" | "right";
  preset: "classic" | "minimal" | "formal";
  receiptTitle: string;
  sealChineseName: string;
  sealEnglishName: string;
  sealSource: "generated" | "uploaded";
  showBusinessRegistration: boolean;
  showContact: boolean;
  showDisclaimer: boolean;
  showNotes: boolean;
  showPaymentMethod: boolean;
  showSignature: boolean;
  showSeal: boolean;
  uploadedSealOffsetX: number;
  uploadedSealOffsetY: number;
  uploadedSealScale: number;
};

export const uploadedSealLayout = {
  defaultOffsetX: 24,
  defaultOffsetY: 0,
  defaultScale: 100,
  maxOffsetY: 12,
  maxScale: 160,
  minOffsetY: -12,
  minScale: 50,
} as const;

/** The uploaded image must stay inside the 190px signature block. */
export function uploadedSealHorizontalLimit(scale: number) {
  return Math.floor((190 - (94 * scale) / 100) / 2);
}

export const defaultReceiptTemplate: ReceiptTemplate = {
  accentColor: "#1e4c45",
  logoPosition: "left",
  preset: "classic",
  receiptTitle: "RECEIPT",
  sealChineseName: "",
  sealEnglishName: "",
  sealSource: "generated",
  showBusinessRegistration: true,
  showContact: true,
  showDisclaimer: true,
  showNotes: true,
  showPaymentMethod: true,
  showSignature: true,
  showSeal: false,
  uploadedSealOffsetX: uploadedSealLayout.defaultOffsetX,
  uploadedSealOffsetY: uploadedSealLayout.defaultOffsetY,
  uploadedSealScale: uploadedSealLayout.defaultScale,
};

export const receiptTemplatePresets = {
  classic: { accentColor: "#1e4c45", receiptTitle: "RECEIPT" },
  formal: { accentColor: "#263a5c", receiptTitle: "OFFICIAL RECEIPT" },
  minimal: { accentColor: "#303030", receiptTitle: "RECEIPT" },
} as const;
