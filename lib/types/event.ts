export type Event = {
  id: string;
  title: string;
  venue: string;
  date: string;
  end_time?: string;
  price: number;
  description?: string;
  image_url?: string;
  image_crop_data?: ImageCropData;
  status: "draft" | "published";
  venue_id?: string;
  event_type?: "ticketed" | "non_ticketed" | "private";
  notes?: string;
  calendar_color?: string;
};

export type ImageCropData = {
  x: number;
  y: number;
  width: number;
  height: number;
};
