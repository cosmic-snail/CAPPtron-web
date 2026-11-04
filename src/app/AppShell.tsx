import type { ReactNode } from 'react'
import { WorkflowNavigation } from './WorkflowNavigation'
import type { WorkflowStage } from './WorkflowNavigation'

type AppShellProps = {
  live?: boolean
  simulation?: boolean
  onToggleSimulation?: () => void
  onToggleLive?: () => void
  children: ReactNode
  fileBar: ReactNode
  currentStage: WorkflowStage
  onUnavailable: (message: string) => void
  onNavigate: (stage: WorkflowStage) => void
  currentView: 'workflow' | 'foundation'
  onView: (view: 'workflow' | 'foundation') => void
}

export function AppShell({
  children,
  live = false,
  simulation = false,
  onToggleSimulation,
  onToggleLive,
  fileBar,
  currentStage,
  onUnavailable,
  onNavigate,
  currentView,
  onView,
}: AppShellProps) {
  const foundation = currentView === 'foundation'
  return (
    <div
      className={`app-shell${foundation ? ' foundation-shell' : currentStage !== 'input' ? ' planning-shell' : ''}`}
    >
      <header className="app-header">
        <h1>
          {foundation ? (
            <>
              <strong>CNC</strong>
              <span>AGENTIC PROGRAMMING</span>
            </>
          ) : (
            'CNC Agentic Programming'
          )}
        </h1>
        <div className="header-tools">
          {onToggleSimulation && !simulation && (
            <button className="button" onClick={onToggleSimulation}>
              模拟完整流程
            </button>
          )}
          {onToggleLive && (
            <button className="button" onClick={onToggleLive}>
              {live && !simulation ? '切换原型演示' : '切换真实联调'}
            </button>
          )}
          <button
            className="button data-foundation-button"
            type="button"
            aria-current={foundation ? 'page' : undefined}
            onClick={() => onView('foundation')}
          >
            数据底座
          </button>
          {foundation ? (
            <button
              className="button foundation-return"
              type="button"
              onClick={() => onView('workflow')}
            >
              返回智能工艺工作台
            </button>
          ) : (
            <span className="product-label">智能工艺决策</span>
          )}
          {!foundation && (
            <span className="version-label">
              {simulation ? '模拟流程 · 本地 JSON' : live ? '真实 Core API' : 'r06 / 原型演示'}
            </span>
          )}
        </div>
      </header>
      {!foundation && (
        <>
          <WorkflowNavigation
            currentStage={currentStage}
            onUnavailable={onUnavailable}
            onNavigate={onNavigate}
          />
          {fileBar}
        </>
      )}
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        {foundation
          ? '数据资产总量 = 知识 + 业务资源；模型单独计量。目录关联不代表制造可行性验证。'
          : simulation
            ? '模拟验收 · 本地 JSON 保存；未连接 NX / Mastercam，审批与下载仅供界面测试。'
            : live
              ? '真实 API 工作区 · 以服务端准入、审核与执行证据为准。'
              : '原型演示 · Agent / CAM 接口待接入；输入准备不代表 CAM 加工；人工确认不等于仿真或实机验证。'}
      </footer>
    </div>
  )
}
