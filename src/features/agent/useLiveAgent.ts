// 真实联调模式下的 Agent 对话状态。对话只存在 Core 进程内存；这里只保存对话 ID
// 以便刷新后恢复，不保存问答内容。
import { useCallback, useEffect, useRef, useState } from 'react'
import { randomId } from '../../api/browserCrypto'
import { CoreClient } from '../../api/core/client'
import {
  agentAvailability,
  createConversation,
  getConversation,
  isConversationMissing,
  sendAgentMessage,
} from '../../api/core/agent'
import type { AgentContextHint, AgentTurn } from '../../api/core/agent'

export type LiveAgentAvailability =
  'waiting' | 'checking' | 'available' | 'disabled' | 'simulation' | 'error'
export type LiveAgent = {
  availability: LiveAgentAvailability
  turns: AgentTurn[]
  pending: { text: string } | null
  error: string
  notice: string
  send: (text: string, context: AgentContextHint) => Promise<boolean>
  retry: () => void
}

const storageKey = 'capptron.agent.conversations.v1'

function savedConversation(scope: string, taskId: string): string | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    const id =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[`${scope}|${taskId}`]
        : null
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

function saveConversation(scope: string, taskId: string, id: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    const map = value && typeof value === 'object' ? (value as Record<string, string>) : {}
    localStorage.setItem(storageKey, JSON.stringify({ ...map, [`${scope}|${taskId}`]: id }))
  } catch {
    /* 存储不可用时本次页面仍可对话，只是刷新后会新建对话。 */
  }
}

const lostNotice = 'Core 中的原对话已不存在（服务可能已重启），之前的问答已丢失，已新建对话。'
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function useLiveAgent({
  enabled,
  simulation,
  base,
  taskId,
  open,
  fetcher,
}: {
  enabled: boolean
  simulation: boolean
  base: string
  taskId: string | null
  open: boolean
  fetcher?: typeof fetch
}): LiveAgent {
  const [availability, setAvailability] = useState<LiveAgentAvailability>('checking')
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [pending, setPending] = useState<{ text: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const conversation = useRef<string | null>(null)
  const generation = useRef(0)
  const api = useRef(new CoreClient(base, fetcher))
  if (api.current.base !== base) api.current = new CoreClient(base, fetcher)

  // 换任务或关闭真实模式时丢弃旧对话，迟到的响应按 generation 忽略。
  useEffect(() => {
    generation.current += 1
    conversation.current = null
    setTurns([])
    setPending(null)
    setError('')
    setNotice('')
    setAvailability(simulation ? 'simulation' : taskId ? 'checking' : 'waiting')
  }, [enabled, simulation, base, taskId])

  const startConversation = useCallback(
    async (task: string, current: number, fresh = false) => {
      const saved = fresh ? null : savedConversation(base, task)
      if (saved) {
        // 先读取已保存的对话；只有 Core 确认不存在（8401）时才新建并提示历史已丢失，
        // 避免用旧 ID 静默重建出一个空对话。
        try {
          const view = await getConversation(api.current, saved)
          if (generation.current !== current) return
          conversation.current = saved
          setTurns(view.turns)
          return
        } catch (reason) {
          if (!isConversationMissing(reason)) throw reason
          if (generation.current !== current) return
          setNotice(lostNotice)
        }
      }
      const id = randomId()
      const view = await createConversation(api.current, id, task)
      if (generation.current !== current) return
      conversation.current = id
      saveConversation(base, task, id)
      setTurns(view.turns)
    },
    [base],
  )

  useEffect(() => {
    if (!enabled || simulation || !open || !taskId || conversation.current) return
    const current = generation.current
    void (async () => {
      try {
        const state = await agentAvailability(api.current)
        if (generation.current !== current) return
        setAvailability(state)
        if (state === 'available') await startConversation(taskId, current)
      } catch (reason) {
        if (generation.current !== current) return
        setAvailability('error')
        setError(message(reason))
      }
    })()
  }, [enabled, simulation, open, taskId, attempt, startConversation])

  const send = useCallback(
    async (text: string, context: AgentContextHint) => {
      const id = conversation.current
      const trimmed = text.trim()
      if (!id || !trimmed || pending || availability !== 'available') return false
      const current = generation.current
      setPending({ text: trimmed })
      setError('')
      setNotice('')
      try {
        const response = await sendAgentMessage(api.current, id, {
          message_id: randomId(),
          text: trimmed,
          context,
        })
        if (generation.current !== current) return false
        // 以服务端保存的对话为准；读取失败时用本次响应补上这一轮。
        try {
          setTurns((await getConversation(api.current, id)).turns)
        } catch {
          setTurns((list) => [
            ...list,
            {
              turn_id: response.turn_id,
              message_id: '',
              text: trimmed,
              context,
              created_at: '',
              events: response.events,
            },
          ])
        }
        return true
      } catch (reason) {
        if (generation.current !== current) return false
        if (isConversationMissing(reason) && taskId) {
          // Core 重启后对话丢失：新建空对话，不自动重发问题。
          setNotice(`${lostNotice}请重新发送问题。`)
          try {
            await startConversation(taskId, current, true)
          } catch (again) {
            setError(message(again))
          }
        } else setError(message(reason))
        return false
      } finally {
        if (generation.current === current) setPending(null)
      }
    },
    [availability, pending, startConversation, taskId],
  )

  const retry = useCallback(() => {
    conversation.current = null
    setError('')
    setAvailability('checking')
    setAttempt((value) => value + 1)
  }, [])

  return { availability, turns, pending, error, notice, send, retry }
}
