"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { createEditor, Descendant, Editor, Element as SlateElement, Transforms, BaseEditor } from "slate";
import {
  Slate,
  Editable,
  withReact,
  useSlateStatic,
  useSelected,
  useFocused,
  RenderElementProps,
  RenderLeafProps,
  ReactEditor,
} from "slate-react";
import { withHistory, HistoryEditor } from "slate-history";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Loader2,
  X,
} from "lucide-react";

// Type definitions
type ParagraphElement = {
  type: "paragraph";
  align?: "left" | "center" | "right";
  children: CustomText[];
};

type ImageElement = {
  type: "image";
  url: string;
  children: CustomText[];
};

type LinkElement = {
  type: "link";
  url: string;
  children: CustomText[];
};

type CustomElement = ParagraphElement | ImageElement | LinkElement;

type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

interface SignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
}

// Serialize Slate nodes to HTML (email-compatible inline styles)
const serialize = (nodes: Descendant[]): string => {
  return nodes
    .map((node) => {
      if ("text" in node) {
        let text = node.text;
        if (!text) return "";
        text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (node.bold) text = `<strong>${text}</strong>`;
        if (node.italic) text = `<em>${text}</em>`;
        if (node.underline) text = `<u>${text}</u>`;
        return text;
      }

      const children = serialize(node.children);

      switch (node.type) {
        case "paragraph": {
          const align = node.align || "left";
          // Email-compatible inline styles with proper margins
          const baseStyle = "margin: 0 0 8px 0; line-height: 1.5; font-family: Arial, sans-serif; font-size: 14px;";
          const alignStyle = align !== "left" ? ` text-align: ${align};` : "";
          return `<p style="${baseStyle}${alignStyle}">${children || "<br>"}</p>`;
        }
        case "link":
          return `<a href="${node.url}" style="color: #0066cc; text-decoration: underline;">${children}</a>`;
        case "image":
          return `<img src="${node.url}" alt="" style="max-width: 200px; height: auto; display: block; margin: 16px 0; border: 0;" />`;
        default:
          return children;
      }
    })
    .join("");
};

// Deserialize HTML to Slate nodes
const deserialize = (html: string): Descendant[] => {
  if (!html || !html.trim()) {
    return [{ type: "paragraph", children: [{ text: "" }] }];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const parseNode = (node: Node): Descendant | Descendant[] | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      return { text };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const children: Descendant[] = [];

    el.childNodes.forEach((child) => {
      const result = parseNode(child);
      if (result) {
        if (Array.isArray(result)) {
          children.push(...result);
        } else {
          children.push(result);
        }
      }
    });

    if (children.length === 0) {
      children.push({ text: "" });
    }

    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case "p":
      case "div": {
        const style = el.getAttribute("style") || "";
        let align: "left" | "center" | "right" = "left";
        if (style.includes("text-align: center")) align = "center";
        else if (style.includes("text-align: right")) align = "right";
        return { type: "paragraph", align, children: children as CustomText[] };
      }
      case "br":
        return { text: "\n" };
      case "strong":
      case "b":
        return children.map((child) =>
          "text" in child ? { ...child, bold: true } : child
        );
      case "em":
      case "i":
        return children.map((child) =>
          "text" in child ? { ...child, italic: true } : child
        );
      case "u":
        return children.map((child) =>
          "text" in child ? { ...child, underline: true } : child
        );
      case "a":
        return {
          type: "link",
          url: el.getAttribute("href") || "",
          children: children as CustomText[],
        };
      case "img":
        return {
          type: "image",
          url: el.getAttribute("src") || "",
          children: [{ text: "" }],
        };
      default:
        return children;
    }
  };

  const result: Descendant[] = [];
  doc.body.childNodes.forEach((node) => {
    const parsed = parseNode(node);
    if (parsed) {
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) {
          result.push({
            type: "paragraph",
            children: parsed as CustomText[],
          });
        }
      } else {
        result.push(parsed);
      }
    }
  });

  if (result.length === 0) {
    return [{ type: "paragraph", children: [{ text: "" }] }];
  }

  return result;
};

// Plugin to handle images as void elements
const withImages = (editor: CustomEditor) => {
  const { isVoid } = editor;

  editor.isVoid = (element) => {
    return element.type === "image" ? true : isVoid(element);
  };

  return editor;
};

// Plugin to handle links as inline elements
const withInlines = (editor: CustomEditor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.type === "link" ? true : isInline(element);
  };

  return editor;
};

// Insert image into editor
const insertImage = (editor: CustomEditor, url: string) => {
  const image: ImageElement = { type: "image", url, children: [{ text: "" }] };
  Transforms.insertNodes(editor, image);
  Transforms.insertNodes(editor, {
    type: "paragraph",
    children: [{ text: "" }],
  });
};

// Image component with selection highlight
const ImageComponent = ({ attributes, children, element }: RenderElementProps) => {
  const editor = useSlateStatic();
  const path = ReactEditor.findPath(editor, element);
  const selected = useSelected();
  const focused = useFocused();

  if (element.type !== "image") return null;

  // Cast to ImageElement to access url property
  const imageElement = element as ImageElement;
  const imageUrl = imageElement.url;

  return (
    <div {...attributes}>
      {children}
      <div contentEditable={false} className="relative inline-block my-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className={`block max-w-[200px] rounded border ${
              selected && focused ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-200"
            }`}
          />
        ) : (
          <div className="flex items-center justify-center w-24 h-16 bg-slate-100 border border-slate-300 rounded text-xs text-slate-500">
            No image URL
          </div>
        )}
        <button
          type="button"
          onClick={() => Transforms.removeNodes(editor, { at: path })}
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

// Element renderer
const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props;

  switch (element.type) {
    case "image":
      return <ImageComponent {...props} />;
    case "link":
      return (
        <a {...attributes} href={element.url} className="text-sky-600 underline">
          {children}
        </a>
      );
    case "paragraph": {
      const align = element.align || "left";
      return (
        <p {...attributes} style={{ textAlign: align }} className="min-h-[1.5em]">
          {children}
        </p>
      );
    }
    default:
      return <p {...attributes}>{children}</p>;
  }
};

// Leaf renderer
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }
  if (leaf.italic) {
    children = <em>{children}</em>;
  }
  if (leaf.underline) {
    children = <u>{children}</u>;
  }
  return <span {...attributes}>{children}</span>;
};

// Toolbar button
function ToolbarButton({
  active,
  disabled,
  onMouseDown,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onMouseDown: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active
          ? "bg-sky-100 text-sky-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

// Mark helpers
const isMarkActive = (editor: CustomEditor, format: "bold" | "italic" | "underline") => {
  const marks = Editor.marks(editor);
  return marks ? marks[format] === true : false;
};

const toggleMark = (editor: CustomEditor, format: "bold" | "italic" | "underline") => {
  const isActive = isMarkActive(editor, format);
  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

// Alignment helpers
const isAlignActive = (editor: CustomEditor, align: "left" | "center" | "right") => {
  const [match] = Editor.nodes(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === "paragraph" && n.align === align,
  });
  return !!match;
};

const toggleAlign = (editor: CustomEditor, align: "left" | "center" | "right") => {
  Transforms.setNodes(
    editor,
    { align },
    { match: (n) => SlateElement.isElement(n) && n.type === "paragraph" }
  );
};

export default function SignatureEditor({ value, onChange }: SignatureEditorProps) {
  const editor = useMemo(
    () => withInlines(withImages(withHistory(withReact(createEditor())))),
    []
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  // Parse initial value
  const initialValue = useMemo(() => deserialize(value), []);

  // Handle editor changes
  const handleChange = useCallback(
    (newValue: Descendant[]) => {
      const isAstChange = editor.operations.some(
        (op) => op.type !== "set_selection"
      );
      if (isAstChange) {
        const html = serialize(newValue);
        onChange(html);
      }
    },
    [editor, onChange]
  );

  // Handle image upload
  const handleImageUpload = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setImageUploading(true);

        const { data: userData } = await supabaseClient.auth.getUser();
        const user = userData.user;
        if (!user) {
          alert("You must be logged in to upload images.");
          return;
        }

        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("email-signatures")
          .upload(path, file, { upsert: true });

        if (uploadError) {
          alert(uploadError.message || "Failed to upload image.");
          return;
        }

        const {
          data: { publicUrl },
        } = supabaseClient.storage.from("email-signatures").getPublicUrl(path);

        // Insert image into editor
        insertImage(editor, publicUrl);
      } catch (err) {
        console.error("Image upload error:", err);
        alert("Unexpected error uploading image.");
      } finally {
        setImageUploading(false);
      }
    };
    input.click();
  }, [editor]);

  // Handle link insert
  const handleLinkInsert = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (!url) return;

    const { selection } = editor;
    if (!selection) return;

    const link: LinkElement = {
      type: "link",
      url,
      children: [{ text: url }],
    };

    Transforms.insertNodes(editor, link);
  }, [editor]);

  // Render element callback
  const renderElement = useCallback(
    (props: RenderElementProps) => <Element {...props} />,
    []
  );

  // Render leaf callback
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/50 px-2 py-1.5">
          <ToolbarButton
            active={isMarkActive(editor, "bold")}
            onMouseDown={() => toggleMark(editor, "bold")}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={isMarkActive(editor, "italic")}
            onMouseDown={() => toggleMark(editor, "italic")}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={isMarkActive(editor, "underline")}
            onMouseDown={() => toggleMark(editor, "underline")}
            title="Underline"
          >
            <Underline className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-slate-200" />

          <ToolbarButton
            active={isAlignActive(editor, "left")}
            onMouseDown={() => toggleAlign(editor, "left")}
            title="Align Left"
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={isAlignActive(editor, "center")}
            onMouseDown={() => toggleAlign(editor, "center")}
            title="Align Center"
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={isAlignActive(editor, "right")}
            onMouseDown={() => toggleAlign(editor, "right")}
            title="Align Right"
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-slate-200" />

          <ToolbarButton onMouseDown={handleLinkInsert} title="Insert Link">
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onMouseDown={handleImageUpload}
            disabled={imageUploading}
            title="Insert Image"
          >
            {imageUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
          </ToolbarButton>
        </div>

        {/* Editor */}
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder="Type your email signature here..."
          className="min-h-[120px] px-3 py-2 text-sm text-slate-900 focus:outline-none"
          onKeyDown={(event) => {
            if (event.key === "b" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              toggleMark(editor, "bold");
            }
            if (event.key === "i" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              toggleMark(editor, "italic");
            }
            if (event.key === "u" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              toggleMark(editor, "underline");
            }
          }}
        />
      </Slate>
    </div>
  );
}
