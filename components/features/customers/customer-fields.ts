import type { Customer } from "@/types/records";

/** The eight fields `customerFieldsSchema` accepts — nothing else may be sent. */
export type CustomerFields = {
  address: string;
  businessRegistration: string;
  companyName: string;
  contact: string;
  email: string;
  name: string;
  notes: string;
  phone: string;
};

export const blankCustomerFields = (): CustomerFields => ({
  address: "",
  businessRegistration: "",
  companyName: "",
  contact: "",
  email: "",
  name: "",
  notes: "",
  phone: "",
});

/**
 * The API validates with a strict schema, so `id`, `status` and the timestamps
 * must be stripped before saving. Sending the whole record is what made every
 * customer save fail with “客戶資料格式不正確。”
 */
export function customerFields(customer: Partial<Customer>): CustomerFields {
  return {
    address: customer.address ?? "",
    businessRegistration: customer.businessRegistration ?? "",
    companyName: customer.companyName ?? "",
    contact: customer.contact ?? "",
    email: customer.email ?? "",
    name: customer.name ?? "",
    notes: customer.notes ?? "",
    phone: customer.phone ?? "",
  };
}
