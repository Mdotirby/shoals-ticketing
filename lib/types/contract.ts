export type ContractSource = "generated" | "uploaded";
export type ContractStatus = "draft" | "sent" | "signed" | "void";

export type ContractClause = {
  title: string;
  body: string;
};

export type Contract = {
  id: string;
  offer_id?: string;
  event_id?: string;
  venue_id: string;
  source: ContractSource;
  guarantee?: number;
  deal_type?: string;
  backend_percentage?: string;
  bonus_structure?: string;
  radius_clause?: string;
  deposit_amount?: number;
  deposit_paid: boolean;
  file_url?: string;
  file_name?: string;
  version: number;
  custom_clauses?: ContractClause[];
  status: ContractStatus;
  signed_at?: string;
  signed_by_artist?: string;
  signed_by_buyer?: string;
  created_at: string;
  updated_at: string;
};
