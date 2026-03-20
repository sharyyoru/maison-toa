/**
 * TypeScript types for DOCX editor
 */

import { BaseEditor } from 'slate';
import { ReactEditor } from 'slate-react';
import { HistoryEditor } from 'slate-history';

// Extend Slate types
export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

export type ParagraphElement = {
  type: 'paragraph';
  align?: 'left' | 'center' | 'right' | 'justify';
  children: CustomText[];
};

export type HeadingOneElement = {
  type: 'heading-one';
  align?: 'left' | 'center' | 'right' | 'justify';
  children: CustomText[];
};

export type HeadingTwoElement = {
  type: 'heading-two';
  align?: 'left' | 'center' | 'right' | 'justify';
  children: CustomText[];
};

export type HeadingThreeElement = {
  type: 'heading-three';
  align?: 'left' | 'center' | 'right' | 'justify';
  children: CustomText[];
};

export type BulletedListElement = {
  type: 'bulleted-list';
  children: ListItemElement[];
};

export type NumberedListElement = {
  type: 'numbered-list';
  children: ListItemElement[];
};

export type ListItemElement = {
  type: 'list-item';
  children: CustomText[];
};

export type TableElement = {
  type: 'table';
  children: TableRowElement[];
};

export type TableRowElement = {
  type: 'table-row';
  children: TableCellElement[];
};

export type TableCellElement = {
  type: 'table-cell';
  children: CustomElement[];
};

export type LinkElement = {
  type: 'link';
  url: string;
  children: CustomText[];
};

export type ImageElement = {
  type: 'image';
  url: string;
  alt?: string;
  children: CustomText[];
};

export type CustomElement =
  | ParagraphElement
  | HeadingOneElement
  | HeadingTwoElement
  | HeadingThreeElement
  | BulletedListElement
  | NumberedListElement
  | ListItemElement
  | TableElement
  | TableRowElement
  | TableCellElement
  | LinkElement
  | ImageElement;

export type FormattedText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: 'small' | 'normal' | 'medium' | 'large' | 'xl';
};

export type CustomText = FormattedText;

declare module 'slate' {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
