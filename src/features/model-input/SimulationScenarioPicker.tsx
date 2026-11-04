import { useState } from 'react'
import { simulationScenario, simulationScenarioKey } from '../../api/simulation/runtime'
import type { SimulationScenario } from '../../api/simulation/runtime'

export function SimulationScenarioPicker({ disabled }: { disabled: boolean }) {
  const [scenario, setScenario] = useState<SimulationScenario>(() => {
    try {
      return simulationScenario()
    } catch {
      return 'normal'
    }
  })
  const [error, setError] = useState('')
  return (
    <>
      <label className="simulation-scenario">
        模拟场景
        <select
          aria-label="模拟场景"
          value={scenario}
          disabled={disabled}
          onChange={(event) => {
            try {
              localStorage.setItem(simulationScenarioKey, event.target.value)
              setScenario(event.target.value as SimulationScenario)
              setError('')
            } catch {
              setError('模拟场景保存失败，请检查浏览器存储权限。')
            }
          }}
        >
          <option value="normal">正常流程</option>
          <option value="needs-replan">需补充信息后重新规划</option>
          <option value="parse-failure">NX 解析失败</option>
          <option value="cam-failure">CAM 执行失败</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
