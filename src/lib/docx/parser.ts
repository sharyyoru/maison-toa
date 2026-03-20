/**
 * DOCX Parser - Convert .docx files to Slate.js format
 * Uses mammoth.js to extract content from .docx files
 * Works in Node.js (server-side)
 */

import mammoth from 'mammoth';

export type SlateNode = SlateElement | SlateText;

export interface SlateElement {
  type: string;
  children: SlateNode[];
  [key: string]: any;
}

export interface SlateText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  [key: string]: any;
}

/**
 * Parse a .docx file buffer to Slate.js format
 */
export async function parseDocxToSlate(buffer: ArrayBuffer): Promise<SlateNode[]> {
  try {
    // Convert ArrayBuffer to Node.js Buffer for mammoth
    const nodeBuffer = Buffer.from(buffer);
    
    // Convert .docx to HTML using mammoth (Node.js API)
    const result = await mammoth.convertToHtml({ buffer: nodeBuffer });
    const html = result.value;
    
    console.log('Mammoth converted HTML length:', html.length);
    
    // Parse HTML to Slate nodes using simple regex (no DOM needed)
    const nodes = htmlToSlate(html);
    
    return nodes;
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    throw new Error('Failed to parse DOCX file');
  }
}

/**
 * Convert HTML string to Slate.js nodes using regex (Node.js compatible)
 */
function htmlToSlate(html: string): SlateNode[] {
  const nodes: SlateNode[] = [];
  
  // Simple regex-based HTML parsing for server-side
  // Match block-level elements
  const blockRegex = /<(p|h1|h2|h3|ul|ol|li|table|tr|td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
  
  let match;
  let lastIndex = 0;
  
  // If no HTML tags, treat as plain text
  if (!html.includes('<')) {
    if (html.trim()) {
      nodes.push({
        type: 'paragraph',
        children: [{ text: html.trim() }],
      });
    }
  } else {
    // Process each paragraph/block element
    const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = paragraphRegex.exec(html)) !== null) {
      const content = match[1];
      const children = parseInlineContent(content);
      nodes.push({
        type: 'paragraph',
        children: children.length > 0 ? children : [{ text: '' }],
      });
    }
    
    // Process headings
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
    while ((match = h1Regex.exec(html)) !== null) {
      nodes.push({
        type: 'heading-one',
        children: parseInlineContent(match[1]),
      });
    }
    
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((match = h2Regex.exec(html)) !== null) {
      nodes.push({
        type: 'heading-two',
        children: parseInlineContent(match[1]),
      });
    }
    
    const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    while ((match = h3Regex.exec(html)) !== null) {
      nodes.push({
        type: 'heading-three',
        children: parseInlineContent(match[1]),
      });
    }
  }
  
  // Ensure we have at least one paragraph
  if (nodes.length === 0) {
    // Try to extract any text content
    const textContent = html.replace(/<[^>]+>/g, '').trim();
    nodes.push({
      type: 'paragraph',
      children: [{ text: textContent || '' }],
    });
  }
  
  return nodes;
}

/**
 * Parse inline content (bold, italic, etc.) from HTML
 */
function parseInlineContent(html: string): SlateText[] {
  const result: SlateText[] = [];
  
  // Remove HTML tags and get plain text, preserving formatting info
  let text = html;
  
  // Check for formatting
  const hasBold = /<(strong|b)[^>]*>/i.test(html);
  const hasItalic = /<(em|i)[^>]*>/i.test(html);
  const hasUnderline = /<u[^>]*>/i.test(html);
  
  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  
  if (text.trim() || text === '') {
    const textNode: SlateText = { text: text || '' };
    if (hasBold) textNode.bold = true;
    if (hasItalic) textNode.italic = true;
    if (hasUnderline) textNode.underline = true;
    result.push(textNode);
  }
  
  if (result.length === 0) {
    result.push({ text: '' });
  }
  
  return result;
}
