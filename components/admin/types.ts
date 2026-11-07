import type { Tea, TeaImage } from "@/data/teas";

export type AdminTea = Tea & { isActive: boolean };
export type StaffRole = "MANAGER" | "ADMIN" | "SUPER_ADMIN";
export type Draft = Omit<
  Tea,
  "id" | "images" | "isActive" | "sortOrder" | "discountPercent" | "availableStock"
> & {
  images: TeaImage[];
  discountPercent: string;
};

export type MoyskladProduct = { id: string; name: string; code: string };
export type MoyskladOrderState = {
  id: string;
  name: string;
  stateType: string | null;
};

export type AdminOrder = {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  status: string;
  total: number;
  createdAt: string;
  moyskladOrderId: string | null;
  moyskladStatus: string | null;
  moyskladStatusType: string | null;
  items: {
    id: string;
    teaName: string;
    teaUnit: string;
    quantity: number;
    unitPrice: number;
  }[];
};

export type MediaImage = {
  url: string;
  alt: string;
  uploaded?: boolean;
  inUse?: boolean;
};

export type PendingOrderAction = {
  order: AdminOrder;
  action: "paid" | "rejected" | "delete";
  stateId?: string;
  stateName?: string;
};

export const EMPTY_DRAFT: Draft = {
  moyskladAssortmentId: null,
  type: "",
  name: "",
  shortDesc: "",
  price: "",
  discountPercent: "20",
  unit: "₽ / 50г",
  description: "",
  details: [],
  images: [],
};

export function draftFromTea(tea: AdminTea): Draft {
  return {
    moyskladAssortmentId: tea.moyskladAssortmentId,
    type: tea.type,
    name: tea.name,
    shortDesc: tea.shortDesc,
    price: tea.price,
    discountPercent: String(tea.discountPercent),
    unit: tea.unit,
    description: tea.description,
    details: tea.details,
    images: tea.images,
  };
}
