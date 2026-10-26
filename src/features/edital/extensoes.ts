import type { Extensions } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

export const extensoes: Extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
  Highlight,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
]
