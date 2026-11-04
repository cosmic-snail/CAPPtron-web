import type { LiveWorkflow } from './useLiveWorkflow'

export function LiveFeedback({ live }: { live: LiveWorkflow }) {
  return (
    <>
      {live.admission && (
        <p className="warning-text" role="status">
          {live.admission}
        </p>
      )}
      {live.error && (
        <p role="alert" className="warning-text">
          {live.error}
        </p>
      )}
      {live.canRetry && (
        <button className="button" onClick={live.retry}>
          重试 / 继续查询
        </button>
      )}
    </>
  )
}
export function LiveProgress({ live, cam = false }: { live: LiveWorkflow; cam?: boolean }) {
  const ready = !cam && !!live.session && live.status === '工艺方案已就绪'
  const complete = !live.error && !live.canRetry && (cam ? live.cam?.status === 'succeeded' : ready)
  return (
    <>
      <div className="planning-progress-columns">
        <section
          className="planning-references"
          aria-label={live.simulation ? '模拟输入' : 'Core 真实输入'}
        >
          <h3>
            {live.simulation
              ? cam
                ? '模拟 CAM 执行'
                : '模拟工艺规划'
              : cam
                ? 'Mastercam 执行'
                : 'Core 工艺规划'}
          </h3>
          <p>设计文件 / {live.asset?.filename ?? '未提供'}</p>
          <p>任务 / {live.task?.task_id ?? '尚未创建'}</p>
          <p>
            模板 /{' '}
            {live.deployment
              ? `${live.deployment.template.id} ${live.deployment.template.version}`
              : '尚未确认部署配置'}
          </p>
          <p className="muted-text">{cam ? live.cam?.cam_run_id : live.planning?.run_id}</p>
        </section>
        <section
          className="planning-progress-status"
          aria-label={
            live.simulation
              ? cam
                ? 'CAM 模拟进度'
                : '工艺规划模拟进度'
              : cam
                ? 'CAM 真实进度'
                : '工艺规划真实进度'
          }
        >
          <h3 aria-live="polite">{live.status}</h3>
          <progress
            aria-label={cam ? 'CAM 运行中' : 'Core 规划中'}
            max={100}
            value={complete ? 100 : live.busy && !live.error ? undefined : 0}
          />
          <p className="progress-percentage">
            {complete ? '100%' : live.busy ? '处理中…' : '等待继续'}
          </p>
          <p className="muted-text">
            {live.simulation
              ? '本地合成数据 · 未执行真实制造软件'
              : complete
                ? '服务端已返回完成结果'
                : '以 Core 实际阶段为准 · 运行中不估算百分比'}
          </p>
          {cam && live.cam?.observation && (
            <p>执行器观测：{live.cam.observation.state ?? live.cam.observation.availability}</p>
          )}
          {cam && live.cam?.status === 'awaiting_confirmation' && (
            <p className="warning-text">
              等待人工确认 · 自动查询已停止，请由操作人员核实后继续查询。
            </p>
          )}
          {cam && live.cam?.error != null && (
            <p className="warning-text" role="alert">
              CAM 异常 · {live.cam.error.code} · {live.cam.error.message}
            </p>
          )}
          <LiveFeedback live={live} />
        </section>
      </div>
      <footer className="planning-actions">
        <p className="muted-text">
          {live.simulation ? '模拟运行状态' : '真实运行状态'} · 工艺批准与 NC 审核分别进行
        </p>
        {cam ? (
          <button
            className="button"
            disabled={live.busy || live.canRetry || !live.cam}
            onClick={live.refreshCam}
          >
            继续查询 CAM / NC
          </button>
        ) : (
          <button
            className="button primary-button"
            disabled={!ready || live.busy || !!live.error}
            onClick={live.viewResult}
          >
            查看工艺规划结果
          </button>
        )}
      </footer>
    </>
  )
}
