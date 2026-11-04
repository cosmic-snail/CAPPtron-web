import type { OnsiteContract, OnsiteAssessment } from '../../features/process-planning/processPlan'
import type { PlanRef, NcRef } from './client'

export type PlanningRun = {
  basis_feedback_version?: number
  task_id: string
  run_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  output_revision?: number | null
  needs_replan: boolean
  delivery_state: { frontend: 'pending' | 'available' | 'failed'; consumer: string }
  execution_error?: { code: number; message: string } | null
  delivery_error?: { code: number; message: string } | null
}
export type Metadata = {
  name?: string
  unit?: string
  edit_policy?: string
  allowed_values?: number[]
  source?: {
    kind: string
    resource_id: string
    sha256: string
    pointer: string
    engineering_status?: string
  }
}
export type Attributes = {
  parameters?: Record<string, unknown>
  parameter_metadata?: Record<string, Metadata>
  setup?: string
  notes?: string
  mastercam_operation_id?: number
  tool?: { station?: number; tool_number?: number }
  resources?: {
    id: string
    name: string
    kind: 'tool' | 'machine' | 'other'
    description?: string
  }[]
}
export type LivePlan = {
  task_id: string
  result_id: string
  revision: number
  run_id: string
  provider: string
  schema_version: string
  payload: {
    part?: { name?: string }
    operations: {
      id: string
      sequence: number
      name: string
      attributes: Attributes
      steps: { id: string; sequence: number; content: string; attributes?: Attributes }[]
    }[]
    extensions: {
      onsite_contract?: OnsiteContract
      onsite_record_attestation?: OnsiteAssessment
      preparation?: { issues: { code: string; detail: string }[] }
      onsite_diagnostics?: { code: string; message: string }[]
      verified_part?: { outer_diameter_mm: number; inner_diameter_mm: number; thickness_mm: number }
      template: { id: string; version: string; digest: string }
      plan_digest: string
      execution_profile_digest?: string
      reference_only: boolean
      execution_ready: boolean
      engineering_status?: string
      matching_evidence?: { step_sha256: string; report_sha256: string; mcam_sha256: string }
      source_unbound?: boolean
      parameter_rules?: {
        path?: string
        operation_id: string
        parameter_id: string
        unit: string
        edit_policy: string
        value_type: string
        allowed_values?: number[]
      }[]
    }
  }
}
export type ExecutionPreflight = {
  status: 'ready' | 'blocked'
  code: string
  message: string
  next_action: string
  execution_profile_id: string | null
}
export type Card = {
  execution_preflight?: ExecutionPreflight
  task_id: string
  result_id: string
  revision: number
  status: string
  card: unknown | null
  expected_feedback_version: number
  publication_state: string
}
export type NcFile = {
  file_id: string
  filename: string
  setup_id: string
  sequence: number
  encoding: string
  sha256: string
  size_bytes: number
  newline: string
  text: string
}
export type LiveNc = {
  ref: NcRef
  plan_ref: PlanRef
  origin: string
  review_status: string
  is_current_candidate: boolean
  allowed_actions: string[]
  files: Omit<NcFile, 'text' | 'newline'>[]
}
export type Deployment = {
  schema_version: 'golden-deployment-v1'
  source: string
  template: { id: string; version: string; digest: string }
  execution_profile_digest: string
  engineering_binding_configured: boolean
}
