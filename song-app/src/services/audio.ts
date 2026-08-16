let sharedAudioContext: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext()
  }
  return sharedAudioContext
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = getAudioContext()
  // decodeAudioData detaches/consumes the buffer, so pass a copy-safe slice
  return await ctx.decodeAudioData(arrayBuffer.slice(0))
}
