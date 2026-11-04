import { InputPreparationPanel } from '../../features/model-input/InputPreparationPanel'
import { SimulationScenarioPicker } from '../../features/model-input/SimulationScenarioPicker'
import { ModelFilePicker } from '../../features/model-input/ModelFilePicker'
import type { ModelSelection } from '../../features/model-input/modelInput'
import type { LiveWorkflow } from '../../features/core/useLiveWorkflow'

type ModelInputPageProps = {
  live?: LiveWorkflow
  onPlan?: () => void
  selection: ModelSelection
  error: string
  onChoose: () => void
  onFiles: (files: readonly File[]) => void
  onDemo: () => void
}

export function ModelInputPage(props: ModelInputPageProps) {
  return (
    <section className="model-input-page" aria-label="模型输入">
      {props.live?.simulation && (
        <SimulationScenarioPicker
          disabled={props.live.busy || props.live.canRetry || !!props.live.task}
        />
      )}
      <div className="model-input-columns">
        <ModelFilePicker
          {...props}
          simulation={props.live?.simulation}
          liveStatus={
            props.live?.asset
              ? props.live.parsed?.status === 'parsed'
                ? props.live.simulation
                  ? '模拟已解析'
                  : 'Core 已解析'
                : props.live.simulation
                  ? '模拟已上传，解析状态见右侧'
                  : 'Core 已上传，解析状态见右侧'
              : undefined
          }
        />
        <InputPreparationPanel
          selection={props.selection}
          live={props.live}
          onPlan={props.onPlan}
        />
      </div>
    </section>
  )
}
