import { EditorContent, useEditor } from '@tiptap/react'
import { extensoes } from './extensoes'

export function NotasLeitura({ html }: { html: string }) {
  const editor = useEditor({ extensions: extensoes, content: html, editable: false }, [html])
  return <EditorContent editor={editor} className="notas-doc" />
}
