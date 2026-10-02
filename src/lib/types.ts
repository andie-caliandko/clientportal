export type Brand = {
  /** Short name used in tight spots, like task badges ("Cali & Ko"). */
  shortName?: string;
  colors?: Partial<Record<"cream" | "sage" | "stone" | "khaki" | "primary" | "accent", string>>;
  fonts?: { heading?: string; label?: string; body?: string };
  logo?: string;
  logoOnDark?: string;
  mark?: string;
  markOnDark?: string;
};

export type Agency = {
  id: string;
  slug: string;
  name: string;
  portal_domain: string | null;
  brand: Brand;
  timezone: string;
  approval_window_hours: number;
  approval_skip_weekends: boolean;
  notify_emails: string[];
  monthly_rhythm: import("./rhythm").RhythmWeek[];
  new_client_tasks: { title: string; note?: string; days?: number; assignee?: string }[];
  plan: string;
  /** The agency owner (sees the CEO dashboard), and admins they've shared it with. */
  owner_id?: string | null;
  ceo_shared_with?: string[] | null;
  /** The Google Drive folder with every SOP, shown on the SOPs tab. */
  sop_folder_url?: string | null;
};

export type Role = "admin" | "account_manager" | "creator";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  account_manager: "Account manager",
  creator: "Creator",
};

export type Member = {
  agency_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  title: string | null;
  email: string;
  /** Their photo in the avatars bucket, if they've added one. */
  avatar_path: string | null;
};

export type Client = {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  account_manager_id: string | null;
  slack_channel_id: string | null;
  drive_folder_id: string | null;
  rella_space_url: string | null;
  dubsado_email: string | null;
  /** The client's contract link (shown as their Open contract button). */
  dubsado_project_url: string | null;
  website: string | null;
  start_date: string | null;
  archived_at: string | null;
  /** Archived clients can still sign in until this date (30 days after archiving). */
  access_ends_at?: string | null;
  logins_removed_at?: string | null;
  /** Main contact saved when the client was set up without sending the invite yet. */
  contact_name?: string | null;
  contact_email?: string | null;
  logo_path: string | null;
};

export type ClientUser = {
  client_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  email: string;
};

export type Step = {
  id: string;
  position: number;
  kind: "contract" | "questionnaire" | "upload_branding" | "upload_content" | "booking" | "custom";
  title: string;
  help: string;
  action_label: string;
  action_url: string | null;
};

export type Question = { id: string; position: number; prompt: string; hint: string; required: boolean };

export type Calendar = {
  id: string;
  client_id: string;
  month: string;
  rella_url: string;
  sent_at: string;
  due_at: string;
  status: "pending" | "approved" | "auto_approved";
  resolved_at: string | null;
};

export type Attachment = { name: string; path: string; size?: number; type?: string };

export type Message = {
  id: string;
  attachments: Attachment[];
  author_id: string | null;
  author_name: string;
  author_kind: "client" | "team";
  body: string;
  created_at: string;
};

export type Doc = { id: string; kind: "strategy" | "report"; title: string; storage_path: string; created_at: string };

export type Task = {
  id: string;
  /** Recurring tasks: how often it comes back. */
  repeat?: string | null;
  /** A recurring task's next one stays off the board until this date. */
  show_from?: string | null;
  /** Who added it; empty for tasks the system made. */
  created_by: string | null;
  client_id: string | null;
  title: string;
  source: string;
  status: "todo" | "doing" | "waiting" | "done";
  assignee_id: string | null;
  client_assignee_id: string | null;
  note: string | null;
  due_at: string | null;
  auto: boolean;
  created_at: string;
  completed_at: string | null;
  completion_comment: string | null;
  completion_file_path: string | null;
  reminders_sent: number;
};
