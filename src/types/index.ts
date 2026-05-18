export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'dropdown'
  | 'checkbox'
  | 'star_rating'
  | 'image_upload'
  | 'video_upload'
  | 'url';

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[];
  sealEncrypted?: boolean; // encrypt riêng field này bằng Seal
}

export interface OnChainForm {
  objectId: string;
  capId: string;
  configBlobId: string;
  sealPolicyId?: string;
}

export interface FormConfig {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  coverBlobId?: string;
  fields: FormField[];
  sealEncrypted: boolean;
  createdAt: string;
  published: boolean;
  responseCount: number;
  onChain?: OnChainForm;
}

export interface FormResponse {
  id: string;
  formId: string;
  walletAddress: string;
  submittedAt: string;
  data: Record<string, unknown>;
  rating?: number;
  priority?: 'high' | 'medium' | 'low';
  note?: string;
  blobId?: string;
  responseIndex?: number;
}

export type UploadStatus = 'idle' | 'uploading' | 'encrypting' | 'signing' | 'done' | 'error';

export interface TxStatus {
  status: 'idle' | 'pending' | 'success' | 'error';
  digest?: string;
  error?: string;
}