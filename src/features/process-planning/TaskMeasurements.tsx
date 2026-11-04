import { ParameterFields } from './ParameterFields'
import type { Drafts, ProcessPlan } from './processPlan'

export function TaskMeasurements({
  plan,
  drafts,
  onDraft,
  missingCount,
}: {
  plan: ProcessPlan
  drafts: Drafts
  onDraft: (key: string, value: string) => void
  missingCount: number
}) {
  return (
    <section className="operation-detail" aria-label="任务共用信息详情">
      <header className="operation-header task-information-header">
        <h3>任务共用信息</h3>
        <p className="muted-text">{plan.partName} · 所有工序共用，只需集中填写一次</p>
        <p className="warning-text">
          {plan.origin === 'live' && !plan.taskMeasurements?.length
            ? '现场补充字段待接入 · 不代表信息已补齐'
            : missingCount
              ? `还有 ${missingCount} 项必填信息待填写或修正`
              : '共用必填信息已补齐 · 未完成制造校核'}
        </p>
      </header>
      <div className="detail-scroll" tabIndex={0} role="region" aria-label="任务共用现场信息">
        {plan.origin !== 'live' && (
          <section>
            <p className="warning-text">本地演示草稿，未提交服务器，未完成制造校核。</p>
            <p className="muted-text">
              以下必填项为 Demo
              填写门槛，尚未定义正式制造必填清单。工序专用信息请查看左侧“待填”标记。
            </p>
          </section>
        )}
        <ParameterFields
          operationId={plan.id}
          section="task"
          parameters={plan.taskMeasurements ?? []}
          drafts={drafts}
          onDraft={onDraft}
          emptyText="暂无任务共用信息"
        />
      </div>
    </section>
  )
}
