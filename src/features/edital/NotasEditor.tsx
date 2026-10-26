import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { Bold, CheckSquare, Code, Heading1, Heading2, Heading3, Highlighter, Italic, List, ListOrdered, Quote, Table2, Underline } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { extensoes } from './extensoes'

interface Acao {
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  ativo: (e: Editor) => boolean
  run: (e: Editor) => void
}

const acoes: Acao[] = [
  { label: 'Negrito', icon: Bold, ativo: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { label: 'Itálico', icon: Italic, ativo: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: 'Sublinhado', icon: Underline, ativo: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { label: 'Destaque', icon: Highlighter, ativo: (e) => e.isActive('highlight'), run: (e) => e.chain().focus().toggleHighlight().run() },
  { label: 'Título 1', icon: Heading1, ativo: (e) => e.isActive('heading', { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Título 2', icon: Heading2, ativo: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Título 3', icon: Heading3, ativo: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Lista', icon: List, ativo: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Lista numerada', icon: ListOrdered, ativo: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Tarefas', icon: CheckSquare, ativo: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: 'Código', icon: Code, ativo: (e) => e.isActive('codeBlock'), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Citação', icon: Quote, ativo: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: 'Tabela', icon: Table2, ativo: (e) => e.isActive('table'), run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]

interface Props {
  initialHtml: string
  onChange: (html: string) => void
  ariaLabel: string
}

export function NotasEditor({ initialHtml, onChange, ariaLabel }: Props) {
  const editor = useEditor({
    extensions: extensoes,
    content: initialHtml,
    editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel, class: 'notas-doc min-h-[40vh] p-3 outline-none' } },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })
  const ativos = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? acoes.map((a) => a.ativo(e)) : []),
  })

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div role="toolbar" aria-label="Formatação" className="flex gap-1 overflow-x-auto border-b border-line p-1.5">
        {acoes.map((a, i) => (
          <button
            key={a.label}
            type="button"
            aria-label={a.label}
            title={a.label}
            aria-pressed={ativos?.[i] ?? false}
            disabled={!editor}
            onClick={() => editor && a.run(editor)}
            className={cn('grid size-9 shrink-0 place-items-center rounded-md hover:bg-line/50', ativos?.[i] && 'bg-line text-navy dark:text-sea')}
          >
            <a.icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
