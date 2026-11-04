import { randomId } from '../../api/browserCrypto'

export type AgentMessage = {
  id: string
  role: 'user' | 'demo'
  text: string
  operationId: string | null
  contextLabel: string
}

export function createDemoExchange(
  text: string,
  operationId: string | null,
  contextLabel: string,
): AgentMessage[] {
  const context = { operationId, contextLabel }
  return [
    { ...context, id: randomId(), role: 'user', text },
    {
      ...context,
      id: randomId(),
      role: 'demo',
      text: '尚未连接真实 Agent。这是固定的 Demo 说明，不针对输入进行推理。未修改参数或工序，未调用 CAM，未生成或验证 NC，也未向服务器保存任何业务数据。',
    },
  ]
}
