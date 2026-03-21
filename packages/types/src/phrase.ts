export interface PhraseSet {
  id: string;
  meeting_id: string;
  name: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Phrase {
  id: string;
  phrase_set_id: string;
  text: string;
  normalized_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
