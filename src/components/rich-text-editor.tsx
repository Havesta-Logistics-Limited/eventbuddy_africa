"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { Bold, Italic, Image as ImageIcon, Link2, List, ListOrdered, Loader2 } from "lucide-react";
import { cn, compressImageFile } from "@/lib/utils";

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-brand-600/10 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/** A minimal rich text editor (bold/italic/lists/links, plus images when
 *  `allowImages` is set — no headings or code blocks) for organizer-authored
 *  copy that attendees actually read: event descriptions, announcements, and
 *  audience blasts. Stores its value as HTML; render it back
 *  with <RichTextDisplay> (see rich-text-display.tsx), never raw — the HTML this
 *  produces is schema-constrained by Tiptap itself, but content already in the
 *  database could in principle have been written by some other path, so the
 *  display side sanitizes regardless of where the HTML came from. */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeightClass = "min-h-[90px]",
  allowImages = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClass?: string;
  /** Loads Tiptap's Image extension + an "Insert image" toolbar button — off by
   *  default so existing callers (event descriptions, announcements) are
   *  unaffected. Images are stored as data URLs in the HTML, same as every
   *  other image upload in this app; callers that email this content (the
   *  audience blast) are responsible for converting embedded data URLs into
   *  real attachments before sending, since email clients don't render them. */
  allowImages?: boolean;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        underline: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" } },
      }),
      Placeholder.configure({ placeholder: placeholder || "" }),
      ...(allowImages ? [TiptapImage.configure({ HTMLAttributes: { style: "max-width:100%;" } })] : []),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `rich-text-content max-w-none text-sm text-slate-700 focus:outline-none ${minHeightClass}`,
      },
    },
  });

  // The parent drives `value` (e.g. loading a different event, or clearing the
  // form after submit) — but editor.getHTML() is what produces `value` during
  // normal typing, so only push external changes back in, never on every
  // keystroke (that would fight the user's cursor position).
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl || "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const handleImageFile = async (file: File) => {
    setUploadingImage(true);
    try {
      const dataUrl = await compressImageFile(file, 1000, 0.85);
      editor.chain().focus().setImage({ src: dataUrl }).run();
    } catch {
      // A failed image read just means nothing gets inserted — no error state
      // needed for a single toolbar action the user can immediately retry.
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-brand-600", className)}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100">
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={14} />
        </ToolbarButton>
        <span className="w-px h-4 bg-slate-200 mx-1" />
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={14} />
        </ToolbarButton>
        {allowImages && (
          <>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <ToolbarButton label="Insert image" disabled={uploadingImage} onClick={() => fileInputRef.current?.click()}>
              {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleImageFile(file);
              }}
            />
          </>
        )}
      </div>
      <EditorContent editor={editor} className="px-3.5 py-2.5" />
    </div>
  );
}
