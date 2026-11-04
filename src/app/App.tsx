import { useEffect, useRef, useState } from 'react'
import { useLiveWorkflow } from '../features/core/useLiveWorkflow'
import { AppShell } from './AppShell'
import { FileInfoBar } from '../features/model-input/FileInfoBar'
import { useModelInput } from '../features/model-input/useModelInput'
import { ModelInputPage } from '../pages/model-input/ModelInputPage'
import { WorkflowWorkspace } from './WorkflowWorkspace'
import type { WorkflowStage } from './WorkflowNavigation'
import { inputExampleCase } from '../api/case-catalog'
import type { DataFoundationReader } from '../api/data-foundation/reader'
import { dataFoundationReader } from './dataFoundation'
import { DataFoundationPage } from '../pages/data-foundation/DataFoundationPage'
import { simulationRuntime, simulationSample } from '../api/simulation/runtime'

export default function App({
  foundationReader = dataFoundationReader,
}: {
  foundationReader?: DataFoundationReader
}) {
  const [simulation, setSimulation] = useState(
    () => new URLSearchParams(location.search).get('mode') === 'simulation',
  )
  const [live, setLive] = useState(simulation)
  const inputRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const { selection, error, selectFiles, selectDemo, sourceVersion } = useModelInput()
  const liveWorkflow = useLiveWorkflow(
    selection.kind === 'local' ? selection.file : undefined,
    simulation ? simulationRuntime : undefined,
  )
  const [advanceAfterParse, setAdvanceAfterParse] = useState(false)
  const [stage, setStage] = useState<WorkflowStage>('input')
  const [view, setView] = useState<'workflow' | 'foundation'>('workflow')
  const workspaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = new URL(location.href)
    if (simulation) url.searchParams.set('mode', 'simulation')
    else url.searchParams.delete('mode')
    history.replaceState(null, '', url)
  }, [simulation])

  useEffect(() => {
    if (!advanceAfterParse || !live || liveWorkflow.busy || liveWorkflow.canRetry) return
    if (liveWorkflow.parsed?.status === 'parsed') {
      setAdvanceAfterParse(false)
      setStage('planning')
      if (!liveWorkflow.task && !liveWorkflow.planning) liveWorkflow.createPlan()
    } else if (liveWorkflow.error || liveWorkflow.parsed?.status === 'failed') {
      setAdvanceAfterParse(false)
    }
  }, [advanceAfterParse, live, liveWorkflow])

  function changeView(next: 'workflow' | 'foundation') {
    if (workspaceRef.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement | null)?.blur()
    setView(next)
    setNotice('')
  }

  function openFilePicker() {
    inputRef.current?.click()
  }
  function canReplaceInput() {
    if (
      liveWorkflow.busy ||
      (liveWorkflow.canRetry && !liveWorkflow.pendingUpload) ||
      liveWorkflow.activeCam
    ) {
      setNotice('当前真实任务仍在运行或存在待确认命令，请先完成查询后再更换输入。')
      return false
    }
    return (
      !liveWorkflow.dirty ||
      window.confirm('存在未提交的真实工艺参数草稿。更换输入将丢弃这些草稿，是否继续？')
    )
  }
  function chooseFiles(files: readonly File[]) {
    if (files.length && canReplaceInput()) selectFiles(files)
  }

  return (
    <AppShell
      live={live}
      simulation={simulation}
      onToggleSimulation={() => {
        if (!canReplaceInput()) return
        setSimulation(true)
        setLive(true)
        setStage('input')
        setAdvanceAfterParse(false)
        selectFiles([simulationSample()])
      }}
      onToggleLive={() => {
        if (simulation) {
          if (!canReplaceInput()) return
          setSimulation(false)
          setLive(true)
          setAdvanceAfterParse(false)
          setStage('input')
        } else setLive(!live)
      }}
      currentStage={stage}
      currentView={view}
      onView={changeView}
      onNavigate={(next) => {
        setStage(next)
        setNotice('')
      }}
      onUnavailable={setNotice}
      fileBar={
        <FileInfoBar
          selection={selection}
          liveAssetName={live ? liveWorkflow.asset?.filename : undefined}
          liveStatus={
            live && liveWorkflow.asset
              ? liveWorkflow.parsed?.status === 'parsed'
                ? simulation
                  ? '模拟已解析'
                  : 'Core 已解析'
                : simulation
                  ? '模拟已上传'
                  : 'Core 已上传'
              : undefined
          }
          onReplace={openFilePicker}
          onUnavailable={setNotice}
        />
      }
    >
      <div
        ref={workspaceRef}
        className="workflow-view"
        hidden={view !== 'workflow'}
        inert={view !== 'workflow'}
      >
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".step,.stp"
          aria-label="选择 STEP 模型文件"
          tabIndex={-1}
          onChange={(event) => {
            chooseFiles(Array.from(event.currentTarget.files ?? []))
            // 清空控件值以支持重复选择同一文件；有效选择保存在 React 状态中。
            event.currentTarget.value = ''
          }}
        />
        {stage === 'input' && (
          <ModelInputPage
            live={
              live
                ? {
                    ...liveWorkflow,
                    parse: () => {
                      setAdvanceAfterParse(true)
                      setStage('planning')
                      liveWorkflow.parse()
                    },
                  }
                : undefined
            }
            onPlan={() => {
              liveWorkflow.createPlan()
              setStage('planning')
            }}
            selection={selection}
            error={error}
            onChoose={openFilePicker}
            onFiles={chooseFiles}
            onDemo={() => {
              if (!canReplaceInput()) return
              if (simulation) {
                selectFiles([simulationSample()])
                setNotice('')
                return
              }
              setLive(false)
              selectDemo()
              setStage('planning')
              setNotice('')
            }}
          />
        )}
        <WorkflowWorkspace
          live={live ? liveWorkflow : undefined}
          key={sourceVersion}
          stage={stage}
          visible={view === 'workflow'}
          onNavigate={setStage}
          initialCaseReference={selection.kind === 'demo' ? inputExampleCase : undefined}
        />
        {stage === 'planning' && error && (
          <p className="availability-notice" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <div className="availability-notice">
            <p role="status">{notice}</p>
            <button type="button" onClick={() => setNotice('')} aria-label="关闭功能提示">
              关闭
            </button>
          </div>
        )}
      </div>
      {view === 'foundation' && <DataFoundationPage reader={foundationReader} />}
    </AppShell>
  )
}
