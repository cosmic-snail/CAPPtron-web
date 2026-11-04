import { useEffect, useRef, useState } from 'react'
import { randomId } from '../../api/browserCrypto'
import { loadDemoPlan } from '../../api/mock/processPlans'
import type { DemoPlanId } from '../../api/mock/processPlans'
import { caseCatalogReader, caseChoiceKey } from '../../api/case-catalog'
import type { CaseDocument } from '../../api/case-catalog/types'
import { caseToProcessPlan } from '../../api/case-catalog/adapter'
import type { DetailView } from './OperationDetails'
import type { Drafts, ProcessPlan } from './processPlan'
import { getPlanReadiness, resolveOperation } from './processPlan'
import type { AgentMessage } from '../agent/agentSession'
import type { ProgramDocument } from '../program-review/programDocument'
import { invalidateProgramReview } from '../program-review/programDocument'
export type PlanningSession = {
  taskKey: string
  plan: ProcessPlan
  selectedId: string | null
  view: DetailView | 'task'
  drafts: Drafts
  messages: AgentMessage[]
  input: string
  startedAt: number
  caseDocument?: CaseDocument
  program?: ProgramDocument
  contextRevision: number
  resultViewed: boolean
}

function createSession(plan: ProcessPlan, taskScope: string): PlanningSession {
  return {
    taskKey: JSON.stringify([taskScope, plan.id]),
    plan,
    selectedId: plan.initialOperationId ?? null,
    view: 'steps',
    drafts: {},
    messages: [],
    input: '',
    startedAt: Date.now(),
    resultViewed: false,
    contextRevision: 0,
  }
}

export function useWorkflowSession(
  active: boolean,
  initialCaseReference?: { caseId: string; version: string },
) {
  const [taskScope] = useState(() => randomId())
  const [demoChoice, setDemoChoice] = useState(
    initialCaseReference
      ? caseChoiceKey(initialCaseReference.caseId, initialCaseReference.version)
      : 'simple',
  )
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Record<string, PlanningSession>>({})
  const [caseRequest, setCaseRequest] = useState(
    initialCaseReference ? { ...initialCaseReference, attempt: 0 } : null,
  )
  const [caseLoad, setCaseLoad] = useState<{
    state: 'idle' | 'loading' | 'error'
    message?: string
  }>({ state: initialCaseReference ? 'loading' : 'idle' })
  useEffect(() => {
    if (!caseRequest) return
    let cancelled = false
    caseCatalogReader
      .getCaseVersion(caseRequest.caseId, caseRequest.version)
      .then((document) => {
        if (cancelled) return
        const plan = caseToProcessPlan(document)
        setSessions((current) =>
          current[plan.id]
            ? current
            : {
                ...current,
                [plan.id]: { ...createSession(plan, taskScope), caseDocument: document },
              },
        )
        setCurrentId(plan.id)
        setCaseLoad({ state: 'idle' })
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setCaseLoad({
            state: 'error',
            message: reason instanceof Error ? reason.message : '案例加载失败',
          })
      })
    return () => {
      cancelled = true
    }
  }, [caseRequest, taskScope])
  const [agentOpen, setAgentOpen] = useState(false)
  const session = currentId ? sessions[currentId] : undefined
  const operation = session ? resolveOperation(session.plan, session.selectedId) : null
  const readiness = session ? getPlanReadiness(session.plan, session.drafts) : null
  const taskMissing = readiness?.missing.filter((item) => item.section === 'task').length ?? 0
  const operationMissing =
    readiness?.missing.filter((item) => item.section !== 'task' && item.parameter.editable) ?? []
  function operationPending(id: string) {
    return (
      readiness?.missing.filter(
        (item) => item.section !== 'task' && item.operationId === id && item.parameter.editable,
      ) ?? []
    )
  }
  function fieldView(section: string): DetailView | 'task' {
    return section === 'task'
      ? 'task'
      : section === 'onsite'
        ? 'onsite'
        : section === 'parameters'
          ? 'resources'
          : 'steps'
  }
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active && session?.resultViewed)
      selectedButtonRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [active, operation?.id, session?.resultViewed])
  function updateSession(update: (current: PlanningSession) => PlanningSession) {
    if (!currentId) return
    setSessions((current) => {
      const existing = current[currentId]
      return existing ? { ...current, [currentId]: update(existing) } : current
    })
  }
  function loadDemo(reference?: { caseId: string; version: string }) {
    if (reference) {
      setCurrentId(null)
      setCaseLoad({ state: 'loading' })
      setCaseRequest({ caseId: reference.caseId, version: reference.version, attempt: Date.now() })
      return
    }
    setCaseRequest(null)
    setCaseLoad({ state: 'idle' })
    const plan = loadDemoPlan(demoChoice as DemoPlanId)
    setSessions((current) =>
      current[plan.id]
        ? current
        : {
            ...current,
            [plan.id]: createSession(plan, taskScope),
          },
    )
    setCurrentId(plan.id)
  }
  function selectOperation(id: string) {
    if (!id) {
      updateSession((current) => ({ ...current, view: 'task' }))
      return
    }
    updateSession((current) => ({
      ...current,
      selectedId: id,
      view:
        current.view === 'task'
          ? fieldView(operationPending(id)[0]?.section ?? 'steps')
          : current.view,
    }))
  }
  function updateDraft(key: string, value: string) {
    updateSession((current) =>
      current.drafts[key] === value
        ? current
        : {
            ...current,
            drafts: { ...current.drafts, [key]: value },
            contextRevision: current.contextRevision + 1,
            program: current.program ? invalidateProgramReview(current.program) : undefined,
          },
    )
  }
  return {
    demoChoice,
    setDemoChoice,
    currentId,
    session,
    operation,
    readiness,
    taskMissing,
    operationMissing,
    operationPending,
    fieldView,
    selectedButtonRef,
    updateSession,
    loadDemo,
    selectOperation,
    updateDraft,
    caseLoad,
    setCaseLoad,
    setCaseRequest,
    agentOpen,
    setAgentOpen,
  }
}
export type WorkflowSession = ReturnType<typeof useWorkflowSession>
