import { describe, expect, it } from 'vitest'
import { CommandJournal, migrateJournalScopes } from './commandJournal'

function storage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

describe('CommandJournal', () => {
  it('persists the original request, command, expected version and location across reload', () => {
    const disk = storage()
    const first = new CommandJournal(disk)
    first.update({ task_id: 'task-1', revision: 2 })
    first.begin({
      domain: 'replan',
      command_id: 'replan-1',
      request: { command_id: 'replan-1', base_revision: 2, expected_feedback_version: 0 },
      expected_version: 2,
      task_id: 'task-1',
    })
    expect(new CommandJournal(disk).read().pending).toEqual(first.read().pending)
  })

  it('fails closed on corrupt or full storage', () => {
    const bad = storage()
    bad.setItem('capptron.core.workflow.v1', '{bad')
    expect(() => new CommandJournal(bad).read()).toThrow()
    const full = {
      ...storage(),
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() =>
      new CommandJournal(full).begin({
        domain: 'cam',
        command_id: 'cam-1',
        request: {
          command_id: 'cam-1',
          plan_ref: { task_id: 'task-1' },
          expected_current_revision: 1,
        },
        expected_version: 1,
        task_id: 'task-1',
      }),
    ).toThrow()
  })

  it('rejects invalid persisted domains and command identity', () => {
    const disk = storage()
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({
        pending: {
          domain: 'unknown',
          command_id: 'x',
          request: { command_id: 'y' },
          expected_version: 1,
        },
      }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
    for (const pending of [null, false, 12]) {
      disk.setItem(CommandJournal.key, JSON.stringify({ pending }))
      expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
    }
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({ nc_ref: { cam_run_id: 'run', version: 0, content_digest: 'bad' } }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/identity/i)
    disk.setItem(
      CommandJournal.key,
      JSON.stringify({
        pending: {
          domain: 'cam',
          command_id: 'x',
          request: { command_id: 'y' },
          expected_version: 1,
        },
      }),
    )
    expect(() => new CommandJournal(disk).read()).toThrow(/command journal/i)
  })

  it('uses independent storage keys for different Core bases', () => {
    const disk = storage()
    new CommandJournal(disk, 'http://core-a').update({ task_id: 'task-a' })
    expect(new CommandJournal(disk, 'http://core-b').read()).toEqual({})
  })

  it('migrates legacy descriptor-scoped journals preserving command and task identity', () => {
    const disk = storage()
    const legacy = new CommandJournal(disk, 'http://core|abc123')
    legacy.update({
      asset_id: 'asset-1',
      parse_command_id: 'parse-1',
      task_id: 'task-legacy',
    })
    legacy.begin({
      domain: 'task',
      command_id: 'cmd-v1-original',
      request: {
        command_id: 'cmd-v1-original',
        schema_version: 'template-request-v1',
        payload: { template: { id: 'golden-b7', version: '2.1.0', digest: 'x' } },
      },
      expected_version: null,
      task_id: 'task-legacy',
      asset_id: 'asset-1',
    })
    const next = new CommandJournal(disk, 'http://core')
    migrateJournalScopes(disk, next, ['http://core|abc123', 'http://core|other'])
    const migrated = next.read()
    // 原命令 body 与身份原样迁移，不改写 v1 为 v2、不生成新命令。
    expect(migrated.pending?.command_id).toBe('cmd-v1-original')
    expect(migrated.pending?.request).toMatchObject({
      schema_version: 'template-request-v1',
    })
    expect(migrated.task_id).toBe('task-legacy')
    // 旧 scope 条目保留至兼容窗口结束。
    expect(legacy.read().pending?.command_id).toBe('cmd-v1-original')
    // 当前 scope 已有更晚的命令时，旧数据不覆盖。
    const disk2 = storage()
    const active = new CommandJournal(disk2, 'http://core')
    active.update({ task_id: 'task-new', asset_id: 'asset-2' })
    active.begin({
      domain: 'task',
      command_id: 'cmd-v2-new',
      request: {
        command_id: 'cmd-v2-new',
        schema_version: 'template-request-v2',
        payload: { source: {} },
      },
      expected_version: null,
      task_id: 'task-new',
      asset_id: 'asset-2',
    })
    new CommandJournal(disk2, 'http://core|old').update({ task_id: 'task-stale' })
    disk2.setItem(
      'capptron.core.workflow.v1.' + encodeURIComponent('http://core|corrupt'),
      '{broken',
    )
    migrateJournalScopes(disk2, active, ['http://core|old', 'http://core|corrupt'])
    expect(active.read().pending?.command_id).toBe('cmd-v2-new')
    expect(active.read().task_id).toBe('task-new')
  })
})
