/**
 * DOCX Serializer - Convert Slate.js format to .docx files
 * Uses docx library to generate .docx files
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell } from 'docx';
import { SlateNode } from './parser';

/**
 * Convert Slate.js nodes to .docx file blob
 */
export async function slateToDocx(nodes: SlateNode[], filename: string = 'document.docx'): Promise<Blob> {
  try {
    // Convert Slate nodes to docx paragraphs
    const children = nodes.map(node => convertNode(node)).flat();
    
    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    });
    
    // Generate blob
    const blob = await Packer.toBlob(doc);
    
    return blob;
  } catch (error) {
    console.error('Error serializing to DOCX:', error);
    throw new Error('Failed to create DOCX file');
  }
}

/**
 * Convert a Slate node to docx elements
 */
function convertNode(node: SlateNode): any[] {
  // Text node
  if ('text' in node) {
    return [new TextRun({
      text: node.text || '',
      bold: node.bold,
      italics: node.italic,
      underline: node.underline ? {} : undefined,
    })];
  }
  
  // Element node
  switch (node.type) {
    case 'paragraph':
      return [new Paragraph({
        children: node.children.map(child => convertNode(child)).flat(),
      })];
    
    case 'heading-one':
      return [new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: node.children.map(child => convertNode(child)).flat(),
      })];
    
    case 'heading-two':
      return [new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: node.children.map(child => convertNode(child)).flat(),
      })];
    
    case 'heading-three':
      return [new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: node.children.map(child => convertNode(child)).flat(),
      })];
    
    case 'bulleted-list':
    case 'numbered-list':
      // Process list items
      return node.children.map((child: SlateNode) => {
        if ('type' in child && child.type === 'list-item') {
          return new Paragraph({
            bullet: node.type === 'bulleted-list' ? { level: 0 } : undefined,
            numbering: node.type === 'numbered-list' ? { reference: 'default', level: 0 } : undefined,
            children: child.children.map((c: SlateNode) => convertNode(c)).flat(),
          });
        }
        return convertNode(child);
      }).flat();
    
    case 'list-item':
      return [new Paragraph({
        children: node.children.map(child => convertNode(child)).flat(),
      })];
    
    case 'table':
      return [new Table({
        rows: node.children.map((child: SlateNode) => {
          if ('type' in child && child.type === 'table-row') {
            return new TableRow({
              children: child.children.map((cell: SlateNode) => {
                if ('type' in cell && cell.type === 'table-cell') {
                  return new TableCell({
                    children: cell.children.map((c: SlateNode) => {
                      const converted = convertNode(c);
                      // Ensure we return Paragraph objects for table cells
                      if (converted[0] instanceof Paragraph) {
                        return converted[0];
                      }
                      return new Paragraph({
                        children: converted,
                      });
                    }),
                  });
                }
                return new TableCell({ children: [] });
              }),
            });
          }
          return new TableRow({ children: [] });
        }),
      })];
    
    default:
      // Unknown node type, treat as paragraph
      if (node.children) {
        return [new Paragraph({
          children: node.children.map(child => convertNode(child)).flat(),
        })];
      }
      return [];
  }
}
