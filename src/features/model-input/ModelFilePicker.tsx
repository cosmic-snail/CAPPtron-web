import { useState } from 'react'
import type { DragEvent } from 'react'
import { formatFileSize, selectionName } from './modelInput'
import type { ModelSelection } from './modelInput'

type ModelFilePickerProps = {
  simulation?: boolean
  liveStatus?: string
  selection: ModelSelection
  error: string
  onChoose: () => void
  onFiles: (files: readonly File[]) => void
  onDemo: () => void
}

export function ModelFilePicker({
  selection,
  error,
  onChoose,
  onFiles,
  onDemo,
  liveStatus,
  simulation,
}: ModelFilePickerProps) {
  const [dragging, setDragging] = useState(false)
  const name = selectionName(selection)

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  return (
    <div>
      <div
        className={`file-picker${dragging ? ' is-dragging' : ''}`}
        role="group"
        aria-label="模型文件选择区"
        onClick={(event) => {
          // 空白区域也可选择文件；内部原生按钮各自处理点击与键盘操作。
          if (!(event.target as Element).closest('button')) onChoose()
        }}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          onFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <button
          className="file-picker-trigger"
          type="button"
          onClick={onChoose}
          aria-label={name ? '重新选择模型文件' : '选择模型文件'}
          aria-describedby="file-picker-help"
        >
          <span className="file-picker-plus" aria-hidden="true">
            ＋
          </span>
          <span className="file-picker-title" title={name ?? undefined}>
            {name ?? '选择模型文件'}
          </span>
          <span className="file-picker-description" id="file-picker-help">
            {selection.kind === 'empty' && '选择或拖入 STEP / STP · 仅本地选择'}
            {selection.kind === 'local' &&
              `${selection.extension} · ${formatFileSize(selection.file.size)} · ${liveStatus ?? '尚未上传或解析'}`}
            {selection.kind === 'demo' && 'Demo · 示例元数据，未读取真实模型'}
          </span>
        </button>
        <button className="button demo-button" type="button" onClick={onDemo}>
          {simulation ? '使用示例 Golden-simulation.step' : '使用示例 Ring_A.step'}
        </button>
      </div>
      {error && (
        <p className="file-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
