import { ParameterFields } from './ParameterFields'
import type { Drafts } from './ParameterFields'
import type { ProcessOperation, ProcessPlan } from './processPlan'

export type DetailView = 'steps' | 'resources' | 'onsite'

export function OperationDetails({
  operation,
  plan,
  view,
  onView,
  drafts,
  onDraft,
}: {
  operation: ProcessOperation
  plan: ProcessPlan
  view: DetailView
  onView: (view: DetailView) => void
  drafts: Drafts
  onDraft: (key: string, value: string) => void
}) {
  const fieldProps = { operationId: operation.id, drafts, onDraft }
  return (
    <section className="operation-detail" aria-label="当前工序详情">
      <header className="operation-header">
        <h3>
          {String(operation.sequence).padStart(2, '0')} {operation.name}
        </h3>
        <p className="muted-text">来源：{operation.source}</p>
        {plan.engineeringStatus && (
          <p className="warning-text">
            工程状态 {plan.engineeringStatus}。工艺卡批准或 CAM 完成不代表制造验收通过。
          </p>
        )}
        {plan.parametersFrozen && (
          <p className="muted-text">参数规则为空：模板已冻结。下列参数只读，不能编辑。</p>
        )}
        <div className="detail-switch" role="group" aria-label="工序详情视图">
          {(
            [
              ['steps', '工步详情'],
              ['resources', '参数与资源'],
              ['onsite', '补充信息'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="button"
              aria-pressed={view === id}
              onClick={() => onView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div
        key={`${operation.id}-${view}`}
        className="detail-scroll"
        tabIndex={0}
        role="region"
        aria-label="工序详情正文"
      >
        {view === 'steps' && (
          <>
            <section>
              <h4>装夹与定位</h4>
              {operation.setupId && <p>装夹 {operation.setupId}</p>}
              <p>
                {operation.setup && operation.setup !== '未提供'
                  ? operation.setup
                  : operation.setupId
                    ? '装夹说明未另行提供。'
                    : '暂无装夹与定位说明'}
              </p>
            </section>
            <section>
              <h4>加工内容 · {operation.steps.length} 个工步</h4>
              {!operation.steps.length && (
                <p className="muted-text">暂无工步信息，等待上游方案补充。</p>
              )}
              {operation.steps.map((step) => (
                <article key={step.id} className="process-step">
                  <h5>
                    {String(step.sequence).padStart(2, '0')} {step.name}
                  </h5>
                  {step.description && <p>{step.description}</p>}
                  <ParameterFields
                    {...fieldProps}
                    section={`step-${step.id}`}
                    parameters={step.parameters}
                    emptyText="此工步暂无参数信息。"
                  />
                </article>
              ))}
            </section>
            <section>
              <h4>补充信息与说明</h4>
              {!!plan.taskMeasurements?.length && (
                <p className="muted-text">
                  另有 {plan.taskMeasurements.length} 项任务共用现场信息，请从
                  左侧“任务共用信息”集中填写。
                </p>
              )}
              <p className="warning-text">
                {operation.onsiteMeasurements.length
                  ? `${operation.onsiteMeasurements.length} 项工序专用信息，请按字段说明补充或核对。`
                  : '暂无工序专用补充项；不代表加工要求或现场条件已确认。'}
              </p>
              <p className="muted-text">{operation.notes ?? '暂无补充说明'}</p>
            </section>
          </>
        )}
        {view === 'resources' && (
          <>
            <section>
              <h4>
                工艺参数 ·{' '}
                {plan.simulation
                  ? '本地模拟'
                  : plan.origin === 'live'
                    ? 'Core 实际结果'
                    : 'Mock 演示'}
              </h4>
              <p className="muted-text">
                {plan.origin === 'live'
                  ? '当前 revision 参数，来源与单位见字段；草稿提交后才产生新修订。'
                  : '预设或基线记录，来源见字段；未执行本次参数推荐或 CAM 仿真。'}
              </p>
              <div
                className="parameter-scroll"
                role="region"
                aria-label="推荐参数列表"
                tabIndex={0}
              >
                <ParameterFields
                  {...fieldProps}
                  section="parameters"
                  parameters={operation.parameters}
                  emptyText="暂无推荐参数；该工序可能不适用切削参数。"
                />
              </div>
            </section>
            <section>
              <h4>
                生产资源 ·{' '}
                {plan.simulation ? '本地模拟' : plan.origin === 'live' ? 'Core' : 'Mock 演示'}
              </h4>
              {!operation.resources.length && (
                <p className="muted-text">
                  {plan.origin === 'live' ? '未提供' : '暂无生产资源信息'}
                </p>
              )}
              <ul className="resource-list">
                {operation.resources.map((resource) => (
                  <li key={resource.id}>
                    <span className="muted-text">
                      {{ tool: '刀具', machine: '设备', other: '其他资源' }[resource.kind]}
                    </span>
                    <strong>{resource.name}</strong>
                    <p>{resource.description ?? '暂无规格说明'}</p>
                    <span className="warning-text">
                      {resource.status === 'pending' ? '待核实' : 'Demo · 未核实可用性'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="onsite-callout">
              <h4>加工要求与现场信息</h4>
              <p>当前工序专用 {operation.onsiteMeasurements.length} 项 · 填写草稿不代表现场确认</p>
              <button className="button" onClick={() => onView('onsite')}>
                查看并补充信息
              </button>
            </section>
          </>
        )}
        {view === 'onsite' && (
          <>
            <section>
              <h4>加工要求与现场信息</h4>
              <p className="warning-text">
                {plan.origin === 'live'
                  ? '现场信息可填写并提交记录；未应用到 CAM，未完成制造校核。'
                  : '本地演示草稿，未提交服务器，未完成制造校核。'}
              </p>
              {!!plan.taskMeasurements?.length && (
                <p className="muted-text">
                  {plan.origin === 'live'
                    ? '共用字段请在左侧“任务共用信息”填写，本页只展示当前工序专用信息。'
                    : '共用字段已集中到左侧“任务共用信息”，本页只展示当前工序专用信息。'}
                </p>
              )}
            </section>
            <section aria-label="当前工序专用补充信息">
              <h4>当前工序专用信息</h4>
              <ParameterFields
                {...fieldProps}
                section="onsite"
                parameters={operation.onsiteMeasurements}
                emptyText="暂无工序专用补充项，等待上游提供；不代表无需确认。"
              />
            </section>
          </>
        )}
      </div>
    </section>
  )
}
