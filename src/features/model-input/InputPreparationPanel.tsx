import { useState } from 'react'
import type { ModelSelection } from './modelInput'
import type { LiveWorkflow } from '../core/useLiveWorkflow'
import { LiveFeedback } from '../core/LiveProgress'

export function InputPreparationPanel({
  selection,
  live,
  onPlan,
}: {
  selection: ModelSelection
  live?: LiveWorkflow
  onPlan?: () => void
}) {
  const [restoreOpen, setRestoreOpen] = useState(false)
  const modelStatus =
    selection.kind === 'local'
      ? '本地已选择，尚未上传或解析'
      : selection.kind === 'demo'
        ? '使用演示输入'
        : '待选择'
  return (
    <section className="input-preparation" aria-labelledby="preparation-title">
      <div className="input-preparation-heading">
        <h3 id="preparation-title">输入准备</h3>
        {live && (
          <details
            className="input-restore"
            open={restoreOpen}
            onToggle={(event) => setRestoreOpen(event.currentTarget.open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setRestoreOpen(false)
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}
          >
            <summary>恢复已有输入 / 任务</summary>
            <div className="input-restore-panel" role="region" aria-label="恢复已有输入或任务">
              <fieldset>
                <legend>复用已解析的模型</legend>
                <label>
                  资产 ID
                  <input
                    aria-label="恢复资产 ID"
                    value={live.restoreAssetId}
                    onChange={(event) => live.setRestoreAssetId(event.target.value)}
                  />
                </label>
                <label>
                  解析命令 ID
                  <input
                    aria-label="恢复解析命令 ID"
                    value={live.restoreParseId}
                    onChange={(event) => live.setRestoreParseId(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={
                    live.busy ||
                    live.canRetry ||
                    live.dirty ||
                    live.activeCam ||
                    !live.restoreAssetId.trim() ||
                    !live.restoreParseId.trim()
                  }
                  onClick={live.restoreParsedInput}
                >
                  复用已验证解析
                </button>
              </fieldset>
              <fieldset>
                <legend>恢复已有任务</legend>
                <label>
                  任务 ID
                  <input
                    aria-label="恢复任务 ID"
                    value={live.restoreTaskId}
                    onChange={(event) => live.setRestoreTaskId(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={
                    live.busy ||
                    live.canRetry ||
                    live.dirty ||
                    live.activeCam ||
                    !live.restoreTaskId.trim()
                  }
                  onClick={live.restoreKnownTask}
                >
                  查询已有任务与 CAM
                </button>
              </fieldset>
              {restoreOpen && <LiveFeedback live={live} />}
            </div>
          </details>
        )}
      </div>
      <dl className="preparation-items">
        <div>
          <dt>模型 / 图纸</dt>
          <dd aria-live="polite">{live ? live.status : modelStatus}</dd>
        </div>
        <div>
          <dt>制造要求</dt>
          <dd>待提供</dd>
        </div>
        <div>
          <dt>工艺模板与上游方案参考</dt>
          <dd>
            {live?.deployment
              ? `${live.deployment.template.id} ${live.deployment.template.version}`
              : live
                ? '待核对部署配置'
                : '待接入'}
          </dd>
        </div>
      </dl>
      {live ? (
        <>
          <p className="preparation-note">
            {live.simulation
              ? '本地模拟 · 使用内置示例验收完整流程'
              : 'Core 真实模式 · 解析完成后进入工艺规划'}
          </p>
          <button
            className="button"
            disabled={selection.kind !== 'local' || live.busy || live.canRetry || !!live.asset}
            onClick={live.upload}
          >
            上传 STEP
          </button>
          <button
            className="button"
            disabled={!live.asset || live.busy || live.canRetry || live.parsed?.status === 'parsed'}
            onClick={live.parse}
          >
            执行 NX 解析
          </button>
          <button
            className="button primary-button"
            disabled={
              live.parsed?.status !== 'parsed' || live.busy || live.canRetry || !!live.planning
            }
            onClick={onPlan}
          >
            创建任务并规划
          </button>

          {!restoreOpen && <LiveFeedback live={live} />}
        </>
      ) : (
        <p className="preparation-note">
          使用示例将进入 Demo 工艺规划流程；
          <br />
          模型上传与解析接口待接入。
        </p>
      )}
    </section>
  )
}
