const MAX_IMAGE_BYTES = 1_500_000

export async function readNightclubImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('La imagen debe pesar menos de 1,5 MB.')
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la imagen.'))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}
