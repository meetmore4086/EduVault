
export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root level
  icon?: string;
  isPinned?: boolean;
  createdAt?: number;
}

export interface DocumentRecord {
  id: string;
  name: string;
  folderId: string; // References Folder.id
  type: string; // mimeType
  data: string; // base64 or blob URL
  uploadedAt: number;
  size: number;
  summary?: string;
  tags: string[];
}

export interface AIResponse {
  text: string;
  status: 'idle' | 'loading' | 'success' | 'error';
}
