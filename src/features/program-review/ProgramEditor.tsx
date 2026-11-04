import { useLayoutEffect, useRef, useState } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
  undoDepth,
  redoDepth,
} from '@codemirror/commands'
import type { ProgramDocument } from './programDocument'

const externalChange = Annotation.define<boolean>()
export function ProgramEditor({
  document,
  onChange,
  readOnly = false,
}: {
  document: Pick<ProgramDocument, 'id' | 'draftText' | 'revision'>
  onChange: (text: string, revision: number) => void
  readOnly?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ document, onChange })
  const [historyAvailable, setHistoryAvailable] = useState({ undo: false, redo: false })
  useLayoutEffect(() => {
    latest.current = { document, onChange }
  })
  useLayoutEffect(() => {
    const syncHistory = (state: EditorState) => {
      const next = { undo: undoDepth(state) > 0, redo: redoDepth(state) > 0 }
      setHistoryAvailable((previous) =>
        previous.undo === next.undo && previous.redo === next.redo ? previous : next,
      )
    }
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.document.draftText,
        extensions: [
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          lineNumbers(),
          history(),
          keymap.of([
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.contentAttributes.of({ 'aria-label': 'NC 程序草稿', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            syncHistory(update.state)
            if (update.docChanged && !update.transactions.some((t) => t.annotation(externalChange)))
              latest.current.onChange(update.state.doc.toString(), latest.current.document.revision)
          }),
          EditorView.theme(
            {
              '&': {
                height: '100%',
                fontSize: '14px',
                backgroundColor: 'var(--surface-canvas)',
                color: 'var(--text-primary)',
              },
              '.cm-scroller': {
                overflow: 'auto',
                fontFamily: 'Consolas, monospace',
                lineHeight: '24px',
              },
              '.cm-content': { padding: '12px 0', caretColor: 'var(--accent-primary)' },
              '.cm-gutters': {
                backgroundColor: 'var(--surface-canvas)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              },
              '.cm-cursor': { borderLeftColor: 'var(--accent-primary)' },
              '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
                backgroundColor: '#2b5b51 !important',
              },
            },
            { dark: true },
          ),
        ],
      }),
    })
    view.current = editor
    syncHistory(editor.state)
    return () => {
      editor.destroy()
      view.current = null
    }
  }, [document.id, readOnly])
  useLayoutEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== document.draftText)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: document.draftText },
        annotations: externalChange.of(true),
      })
  }, [document.draftText])
  return (
    <div className="program-editor-layout">
      <div className="editor-commands">
        <button
          className="button"
          disabled={readOnly || !historyAvailable.undo}
          title={historyAvailable.undo ? '撤回上一次代码修改' : '暂无可撤销的修改'}
          onClick={() => {
            if (view.current) {
              undo(view.current)
              view.current.focus()
            }
          }}
        >
          撤销修改
        </button>
        <button
          className="button"
          disabled={readOnly || !historyAvailable.redo}
          title={
            historyAvailable.redo
              ? '重新应用刚才撤销的代码修改'
              : '先撤销修改，才能恢复已撤销的内容'
          }
          onClick={() => {
            if (view.current) {
              redo(view.current)
              view.current.focus()
            }
          }}
        >
          恢复已撤销
        </button>
        <span className="muted-text">
          {readOnly
            ? 'Core 原始正文 · 只读 · 不自动折行'
            : 'Ctrl / ⌘ Z 撤销修改 · Ctrl / ⌘ Shift Z 恢复已撤销 · 不自动折行'}
        </span>
      </div>
      <div className="program-editor" ref={host} />
    </div>
  )
}
