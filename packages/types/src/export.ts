export enum ExportType {
  Json = 'json',
  Csv = 'csv',
  Zip = 'zip',
}

export enum ExportStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Expired = 'expired',
}

export interface ExportJob {
  id: string;
  meeting_id: string;
  requested_by_user_id: string;
  export_type: ExportType;
  status: ExportStatus;
  file_path: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
}
