import { describe, expect, it, vi } from 'vitest'
import { CoreClient, sameNcRef, samePlanRef, validateNcFile, assertNcFiles } from './client'

describe('Core HTTP contract', () => {
  it('reuses the command identity after an uncertain POST instead of creating another run', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(new Response('{}'))
    const client = new CoreClient('', fetcher)
    await expect(
      client.post('/cam/runs', { command_id: 'first', plan_ref: 'same' }),
    ).rejects.toThrow('network lost')
    await client.post('/cam/runs', { command_id: 'second', plan_ref: 'same' })
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).command_id).toBe('first')
  })
  it('uploads raw STEP with query identity and never multipart', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset_id: 'asset' })))
    const client = new CoreClient('http://localhost:8000', fetcher)
    await client.upload(new File(['STEP'], 'ring.step'), 'upload-1')
    expect(fetcher.mock.calls[0]![0]).toBe(
      'http://localhost:8000/cad/assets?filename=ring.step&command_id=upload-1',
    )
    expect(fetcher.mock.calls[0]![1].headers['Content-Type']).toBe('application/octet-stream')
  })
  it('keeps slash-containing NC file IDs in query parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    await new CoreClient('', fetcher).file(
      { cam_run_id: 'run', version: 2, content_digest: 'digest' },
      'setup/T.NC',
    )
    expect(fetcher.mock.calls[0]![0]).toBe('/cam/runs/run/nc/versions/2/file?file_id=setup%2FT.NC')
  })
  it('surfaces backend failures without replacing them with demo data', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"not configured"}}', { status: 503 }))
    await expect(new CoreClient('', fetcher).get('/cam/executor')).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

const reference = { cam_run_id: 'run', version: 2, content_digest: 'a'.repeat(64) }
const textDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
describe('NC identity and server download', () => {
  it('compares every NC and plan identity field', () => {
    expect(sameNcRef(reference, { ...reference, content_digest: 'changed' })).toBe(false)
    const plan = { task_id: 'task', result_id: 'result', revision: 1, archive_digest: 'digest' }
    expect(samePlanRef(plan, { ...plan, archive_digest: 'changed' })).toBe(false)
    expect(sameNcRef(reference, { ...reference })).toBe(true)
  })
  it('preserves server ZIP metadata and verifies its own transport digest', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('', {
        headers: {
          'X-Content-SHA256': textDigest,
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="server.zip"',
        },
      }),
    )
    const result = await new CoreClient('https://core', fetcher).download(reference)
    expect(result).toMatchObject({
      ref: reference,
      filename: 'server.zip',
      sha256: textDigest,
      digestVerified: true,
      contentType: 'application/zip',
      sourceUrl: 'https://core/cam/runs/run/nc/versions/2/download',
    })
    expect(result.blob.size).toBe(0)
  })
  it('rejects damaged ZIP bytes and malformed supplied digests', async () => {
    for (const digest of [textDigest, 'invalid']) {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('damaged', { headers: { 'X-Content-SHA256': digest } }))
      await expect(new CoreClient('', fetcher).download(reference)).rejects.toThrow('摘要不匹配')
    }
  })
  it('retains downloads with an unavailable digest without claiming verification', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('zip'))
    expect(await new CoreClient('', fetcher).download(reference)).toMatchObject({
      sha256: null,
      digestVerified: false,
    })
  })
  it('verifies readable NC bytes and newline without normalizing the text', async () => {
    const text = 'G01 X1\r\n'
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
      (n) => n.toString(16).padStart(2, '0'),
    ).join('')
    const file = {
      file_id: 'a',
      filename: 'a.nc',
      setup_id: 's',
      sequence: 1,
      encoding: 'utf-8',
      sha256: digest,
      size_bytes: 8,
    }
    expect(await validateNcFile({ ...file, text, newline: 'crlf' }, file)).toMatchObject({
      text,
      newline: 'crlf',
    })
    await expect(validateNcFile({ ...file, text, newline: 'lf' }, file)).rejects.toThrow('换行')
  })
  it('blocks duplicate file identities and mismatched file metadata', async () => {
    const file = {
      file_id: 'a',
      filename: 'a.nc',
      setup_id: 's',
      sequence: 1,
      encoding: 'utf-8',
      sha256: textDigest,
      size_bytes: 2,
    }
    expect(() => assertNcFiles([file, file])).toThrow('重复身份')
    await expect(
      validateNcFile({ ...file, text: 'NC', newline: 'none', filename: 'other.nc' }, file),
    ).rejects.toThrow('清单不匹配')
    await expect(validateNcFile({ ...file, text: 'NC', newline: 'none' }, file)).rejects.toThrow(
      '字节摘要不匹配',
    )
  })
})
