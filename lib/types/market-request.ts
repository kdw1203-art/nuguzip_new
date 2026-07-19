export type MarketRequestStatus = "open" | "closed";

export type MarketRequest = {
  id: string;
  requestType: string;
  city: string;
  district: string;
  title: string;
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  dueDate: string;
  status: MarketRequestStatus;
  requesterLabel: string;
  relatedSite?: string;
  createdAt: string;
};
