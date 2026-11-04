import { formatFileSize, selectionName } from './modelInput'
import type { ModelSelection } from './modelInput'

type FileInfoBarProps = {
  liveStatus?: string
  liveAssetName?: string
  selection: ModelSelection
  onReplace: () => void
  onUnavailable: (message: string) => void
}

export function FileInfoBar({
  selection,
  onReplace,
  onUnavailable,
  liveStatus,
  liveAssetName,
}: FileInfoBarProps) {
  const name = liveAssetName ?? selectionName(selection)
  return (
    <section className="file-info-bar" aria-label="当前模型文件">
      <div className="file-summary" aria-live="polite" aria-atomic="true">
        {name ? (
          <>
            <span className="file-name" title={name}>
              {name}
            </span>
            <span className="file-source">
              {selection.kind === 'local'
                ? `${selection.extension} · ${formatFileSize(selection.file.size)} · ${liveStatus ?? '本地选择'}`
                : selection.kind === 'demo'
                  ? selection.model.source
                  : liveAssetName
                    ? `Core 已有资产 · ${liveStatus ?? '状态待查询'}`
                    : ''}
            </span>
          </>
        ) : (
          <span>尚未选择模型文件 / 示例仅演示输入状态</span>
        )}
      </div>
      <div className="file-actions">
        <button className="button replace-file-button" type="button" onClick={onReplace}>
          更换文件
        </button>
        <button
          className="button interpretation-button"
          type="button"
          data-unavailable="true"
          title="设计文件解读尚未接入，暂不可用"
          onClick={() =>
            onUnavailable(
              liveStatus
                ? '设计文件解读可视化尚未接入；解析状态见输入准备。'
                : '设计文件解读尚未接入，暂不可用；当前文件未上传或解析。',
            )
          }
        >
          查看解读结果
        </button>
      </div>
    </section>
  )
}
