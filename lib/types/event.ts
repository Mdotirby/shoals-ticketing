export type Event = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  description?: string;
  image_url?: string;
  image_crop_data?: ImageCropData;
  status: "draft" | "published";
  venue_id?: string;
};

export type ImageCropData = {
  x: number;
  y: number;
  width: number;
  height: number;
};
