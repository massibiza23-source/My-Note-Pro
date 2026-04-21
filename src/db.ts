import Dexie, { Table } from 'dexie';
import { Prompt, Category } from './types.ts';

export class MyNoteProDatabase extends Dexie {
  prompts!: Table<Prompt>;
  categories!: Table<Category>;

  constructor() {
    super('MyNoteProDB');
    this.version(1).stores({
      prompts: '++id, title, categoryId, *tags, createdAt, updatedAt',
      categories: '++id, name'
    });
  }
}

export const db = new MyNoteProDatabase();
