// 无压缩 ZIP：模拟下载也提供真实可解包的文件，并始终附带模拟声明。
export function simulationZip(files: { name: string; text: string }[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name),
      data = encoder.encode(file.text)
    let crc = 0xffffffff
    for (const byte of data) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    crc = (crc ^ 0xffffffff) >>> 0
    const local = new Uint8Array(30 + name.length),
      view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x800, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, data.length, true)
    view.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length),
      cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    chunks.push(local, data)
    directory.push(central)
    offset += local.length + data.length
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(
    12,
    directory.reduce((sum, item) => sum + item.length, 0),
    true,
  )
  ev.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' })
}
