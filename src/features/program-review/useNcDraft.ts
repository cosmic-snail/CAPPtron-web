import { useState } from 'react'
type Change = { revision: number; reason: string; at: string }

export function useNcDraft(key: string, original: string, scope: string) {
  const storageKey = `capptron.nc.local-draft.v1.${key}`
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (value && typeof value.text === 'string' && typeof value.saved === 'string')
        return {
          text: value.text as string,
          saved: value.saved as string,
          revision: Number.isSafeInteger(value.revision) ? (value.revision as number) : 1,
          history: Array.isArray(value.history)
            ? (value.history
                .filter(
                  (item: Change) =>
                    Number.isSafeInteger(item?.revision) &&
                    typeof item.reason === 'string' &&
                    typeof item.at === 'string',
                )
                .slice(-20) as Change[])
            : [],
        }
    } catch {
      /* 存储不可用时仍允许查看服务端正文。 */
    }
    return { text: original, saved: original, revision: 1, history: [] as Change[] }
  })
  function update(text: string, saved = draft.saved, reason = '编辑本地草稿') {
    const revision = draft.revision + 1
    const next = {
      text,
      saved,
      revision,
      history: [...draft.history, { revision, reason, at: new Date().toISOString() }].slice(-20),
    }
    setDraft(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...next, original, scope }))
      setError('')
    } catch {
      setError('本地草稿保存失败，请先导出草稿；关闭页面可能丢失修改。')
    }
  }
  let groupChanged = draft.text !== original
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const itemKey = localStorage.key(index)
      if (!itemKey?.startsWith('capptron.nc.local-draft.v1.') || itemKey === storageKey) continue
      const value = JSON.parse(localStorage.getItem(itemKey) ?? 'null')
      if (value?.scope === scope && value.text !== value.original) groupChanged = true
    }
  } catch {
    groupChanged = true
  }
  function exportDraft(filename: string, newline: string) {
    const text =
      newline === 'crlf'
        ? draft.text.replace(/\n/g, '\r\n')
        : newline === 'cr'
          ? draft.text.replace(/\n/g, '\r')
          : draft.text
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.unapproved-draft.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return {
    ...draft,
    error,
    changed: draft.text !== original,
    groupChanged,
    update,
    save: () => update(draft.text, draft.text, '保存暂存点'),
    exportDraft,
  }
}
