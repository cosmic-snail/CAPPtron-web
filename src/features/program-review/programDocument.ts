import { randomId } from '../../api/browserCrypto'
import type { ProgramContent } from '../../api/program-content/reader'
import { encodeProgram } from '../../api/program-content/format'

export type ProgramIdentity = {
  taskKey: string
  sourceAssetId: string
  caseId: string
  caseVersion: string
  caseContentDigest: string
  planId: string
}
export type ProgramDocument = ProgramIdentity &
  Omit<ProgramContent, 'text'> & {
    id: string
    originalText: string
    draftText: string
    savedDraftText: string
    revision: number
    savedRevision: number
    lastModifiedBy?: 'human' | 'agent'
    history: { revision: number; actor: 'human' | 'agent'; reason: string }[]
    review?: { revision: number; contextRevision: number; taskKey: string; documentId: string }
    reviewInvalidated: boolean
  }
export function createProgramDocument(
  identity: ProgramIdentity,
  content: ProgramContent,
): ProgramDocument {
  return {
    ...identity,
    ...content,
    id: randomId(),
    originalText: content.text,
    draftText: content.text,
    savedDraftText: content.text,
    revision: 1,
    savedRevision: 0,
    history: [],
    reviewInvalidated: false,
  }
}
export type ProgramChange = {
  documentId: string
  taskKey: string
  expectedRevision: number
  text: string
  actor: 'human' | 'agent'
  reason: string
}
export function applyProgramChange(
  document: ProgramDocument,
  change: ProgramChange,
): ProgramDocument {
  if (
    change.documentId !== document.id ||
    change.taskKey !== document.taskKey ||
    change.expectedRevision !== document.revision
  )
    throw new Error('程序修订冲突，请基于最新草稿重新提出修改。')
  if (change.text === document.draftText) return document
  const revision = document.revision + 1
  return {
    ...document,
    draftText: change.text,
    revision,
    lastModifiedBy: change.actor,
    history: [...document.history, { revision, actor: change.actor, reason: change.reason }],
    review: undefined,
    reviewInvalidated: true,
  }
}
export function saveProgramDraft(document: ProgramDocument): ProgramDocument {
  return { ...document, savedDraftText: document.draftText, savedRevision: document.revision }
}
export function invalidateProgramReview(document: ProgramDocument): ProgramDocument {
  return { ...document, review: undefined, reviewInvalidated: true }
}
export function canReviewProgram(document: ProgramDocument) {
  return document.source !== 'demo_fixture' && !!document.draftText.trim()
}
export function confirmProgram(
  document: ProgramDocument,
  expectedRevision: number,
  contextRevision: number,
): ProgramDocument {
  if (!canReviewProgram(document) || expectedRevision !== document.revision)
    throw new Error('当前正文或修订不能确认。')
  return {
    ...document,
    reviewInvalidated: false,
    review: {
      revision: document.revision,
      contextRevision,
      taskKey: document.taskKey,
      documentId: document.id,
    },
  }
}
export function exportProgramDraft(document: ProgramDocument, expectedRevision: number) {
  if (!canReviewProgram(document) || expectedRevision !== document.revision)
    throw new Error('缺少合法正文或修订已变化，不能导出。')
  return {
    bytes: encodeProgram(document.draftText, document.format),
    filename: `${document.caseId.replace(/[^a-zA-Z0-9_-]/g, '_')}-draft-r${document.revision}.nc`,
  }
}
