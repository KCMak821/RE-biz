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
  defaultOffsetX: 0,
  defaultOffsetY: 0,
  defaultScale: 90,
  maxOffsetY: 8,
  maxScale: 100,
  minOffsetY: -8,
  minScale: 70,
} as const;

/** The uploaded signature may move only inside its 190px-wide signing field. */
export function uploadedSealHorizontalLimit(scale: number) {
  return Math.floor((190 * (100 - scale)) / 200);
}

export function normalizeUploadedSealLayout(template: ReceiptTemplate): ReceiptTemplate {
  const uploadedSealScale = Math.max(uploadedSealLayout.minScale, Math.min(uploadedSealLayout.maxScale, template.uploadedSealScale));
  const horizontalLimit = uploadedSealHorizontalLimit(uploadedSealScale);
  return {
    ...template,
    uploadedSealOffsetX: Math.max(-horizontalLimit, Math.min(horizontalLimit, template.uploadedSealOffsetX)),
    uploadedSealOffsetY: Math.max(uploadedSealLayout.minOffsetY, Math.min(uploadedSealLayout.maxOffsetY, template.uploadedSealOffsetY)),
    uploadedSealScale,
  };
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
