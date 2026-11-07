"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Image as ImageIcon, Link2, List, ListOrdered, Loader2 } from "lucide-react";
import { imageAlignStyle, type ImageAlign } from "@/lib/rich-text";
import { cn, compressImageFile } from "@/lib/utils";

const IMAGE_WIDTHS = [
  { label: "S", value: "30%" },
  { label: "M", value: "55%" },
  { label: "L", value: "80%" },
  { label: "Full", value: "100%" },
];

/** Adds `width` (a percentage of the content column) and `align` (left,
 *  centre or right) on top of the base Image extension — see the bubble menu
 *  below, which is how they're changed. Both render as one inline style,
 *  width first (the sanitizer reads it from the start of the style), then the
 *  margins that place the picture; that works in email clients as well as on
 *  the site. */
const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "55%",
        parseHTML: (element: HTMLElement) => element.style.width || element.getAttribute("width") || "55%",
        renderHTML: () => ({}),
      },
      // a clickable picture: stored as data-href, made a real link when shown
      // or emailed (linkImages in src/lib/rich-text.ts)
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-href") || (element.parentElement?.tagName === "A" ? element.parentElement.getAttribute("href") : null),
        renderHTML: () => ({}),
      },
      align: {
        default: "left",
        parseHTML: (element: HTMLElement) => {
          const a = element.getAttribute("data-align");
          return a === "center" || a === "right" ? a : "left";
        },
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const width = (node.attrs.width as string) || "55%";
    const align = (node.attrs.align as ImageAlign) || "left";
    const href = node.attrs.href as string | null;
    return ["img", { ...HTMLAttributes, "data-align": align, ...(href ? { "data-href": href } : {}), style: `width:${width};max-width:100%;height:auto;${imageAlignStyle(align)}` }];
  },
});

const IMAGE_ALIGNS: { value: ImageAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align centre", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];

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
        active ? "bg-brand-600/10 text-brand-500" : "text-muted hover:bg-fill hover:text-fg-2"
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
      // allowBase64 defaults to false, meaning Tiptap's own HTML parser would
      // silently drop a data: URL image the next time this content gets
      // re-parsed (setContent, or a fresh editor instance loading saved
      // content) — since every image here is stored as a data URL (same
      // convention as every other image upload in this app), this must be on.
      ...(allowImages ? [ResizableImage.configure({ allowBase64: true })] : []),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `rich-text-content max-w-none text-sm text-fg-2 focus:outline-none ${minHeightClass}`,
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

  // a link on the selected picture (the picture menu's link button)
  const setImageLink = () => {
    const previous = (editor.getAttributes("image").href as string | null) || "";
    const url = window.prompt("Where should the picture link to? Leave empty to remove the link.", previous || "https://");
    if (url === null) return;
    const clean = url.trim();
    if (clean && clean !== "https://" && !/^https?:\/\//i.test(clean)) {
      window.alert("Links must start with https://");
      return;
    }
    editor.chain().focus().updateAttributes("image", { href: clean && clean !== "https://" ? clean : null }).run();
  };

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
    <div className={cn("rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-brand-600", className)}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-line-soft">
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <span className="w-px h-4 bg-fill-strong mx-1" />
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={14} />
        </ToolbarButton>
        <span className="w-px h-4 bg-fill-strong mx-1" />
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={14} />
        </ToolbarButton>
        {allowImages && (
          <>
            <span className="w-px h-4 bg-fill-strong mx-1" />
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
      {allowImages && (
        <BubbleMenu editor={editor} shouldShow={({ editor }) => editor.isActive("image")}>
          <div className="flex items-center gap-0.5 p-1 rounded-lg border border-line bg-surface shadow-lg">
            {IMAGE_WIDTHS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => editor.chain().focus().updateAttributes("image", { width: w.value }).run()}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  editor.getAttributes("image").width === w.value ? "bg-brand-600/10 text-brand-500" : "text-muted hover:bg-fill"
                }`}
              >
                {w.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
            <button
              type="button"
              title={editor.getAttributes("image").href ? `Links to ${editor.getAttributes("image").href}` : "Add a link to this picture"}
              aria-label={editor.getAttributes("image").href ? "Change picture link" : "Add picture link"}
              aria-pressed={!!editor.getAttributes("image").href}
              onClick={setImageLink}
              className={`p-1.5 rounded-md transition-colors ${editor.getAttributes("image").href ? "bg-brand-600/10 text-brand-500" : "text-muted hover:bg-fill"}`}
            >
              <Link2 size={14} />
            </button>
            {IMAGE_ALIGNS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={(editor.getAttributes("image").align || "left") === value}
                onClick={() => editor.chain().focus().updateAttributes("image", { align: value }).run()}
                className={`p-1.5 rounded-md transition-colors ${
                  (editor.getAttributes("image").align || "left") === value ? "bg-brand-600/10 text-brand-500" : "text-muted hover:bg-fill"
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </BubbleMenu>
      )}
    </div>
  );
}
