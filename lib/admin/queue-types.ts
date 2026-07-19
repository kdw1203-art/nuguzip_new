export type ExpertRequestRow = {
  id: string;
  applicant_email: string;
  display_name: string;
  specialty: string;
  expert_type: string | null;
  regions: string[];
  certifications: string[];
  years_experience: number;
  intro: string | null;
  phone: string | null;
  organization: string | null;
  cert_number: string | null;
  document_urls: string[];
  identity_verified: boolean;
  fraud_flags: Array<{ ruleId: string; severity: string; message: string }>;
  workflow_stage: string;
  source_verification_url: string | null;
  status: "pending" | "approved" | "rejected";
  reviewer_email: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  next_revalidation_at: string | null;
};

export type MeetingRequestRow = {
  id: string;
  organizer_email: string;
  title: string;
  description: string | null;
  region: string;
  scheduled_at: string | null;
  capacity: number;
  is_public: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewer_email: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type BannedWordRow = {
  id: string;
  word: string;
  severity: "warn" | "block";
  category: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
