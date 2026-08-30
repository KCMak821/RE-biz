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
};

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
};

export const receiptTemplatePresets = {
  classic: { accentColor: "#1e4c45", receiptTitle: "RECEIPT" },
  formal: { accentColor: "#263a5c", receiptTitle: "OFFICIAL RECEIPT" },
  minimal: { accentColor: "#303030", receiptTitle: "RECEIPT" },
} as const;
