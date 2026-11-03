export type TeaImage = {
  id?: string;
  url: string;
  alt: string;
  sortOrder: number;
  isCover: boolean;
  showInGallery: boolean;
};

export type Tea = {
  id: number;
  type: string;
  name: string;
  shortDesc: string;
  price: string;
  discountPercent: number;
  unit: string;
  description: string;
  details: [string, string][];
  images: TeaImage[];
  isActive: boolean;
  sortOrder: number;
};
