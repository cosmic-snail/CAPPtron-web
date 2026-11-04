// Core 把这些备注留在 preparation，同时用 execution_ready 表示是否已准入。
// 备注必须可见，但不能在服务端已经允许执行时再加一道浏览器否决。

export function preparationBlocksExecution(
  executionReady: boolean | undefined,
  issues: readonly { detail: string }[] | undefined,
) {
  return executionReady !== true && !!issues?.length
}

export function preparationNote(
  executionReady: boolean | undefined,
  issues: readonly { detail: string }[] | undefined,
) {
  if (executionReady !== true || !issues?.length) return ''
  return `服务端已允许本次执行。这些工程备注仍待确认：${issues.map((item) => item.detail).join('；')}`
}
