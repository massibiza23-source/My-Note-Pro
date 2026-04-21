export interface Category {
  id: string;
  name: string;
  icon?: string;
  color: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  variables: string[];
  thumbnail?: string;
}
