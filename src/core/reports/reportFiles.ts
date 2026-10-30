import { Capacitor } from '@capacitor/core'

export async function saveReport(bytes: Uint8Array, filename: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ])
    let binary = ''
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
    const file = await Filesystem.writeFile({ directory: Directory.Cache, path: `reports/${filename}`, data: btoa(binary), recursive: true })
    await Share.share({ title: filename, files: [file.uri], dialogTitle: 'Guardar o abrir reporte' })
    return
  }
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
