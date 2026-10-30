import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  base64: string;
}

/**
 * Downsamples while decoding (so full-resolution camera frames never sit in memory) and
 * re-encodes as JPEG, keeping upload payloads small on roaming connections.
 */
export async function prepareImageForUpload(sourceUri: string, maxEdge: number, quality = 0.8): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(sourceUri, { maxWidth: maxEdge, maxHeight: maxEdge });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  if (!saved.base64) {
    throw new Error('Image encoder returned no data');
  }
  return { uri: saved.uri, width: saved.width, height: saved.height, base64: saved.base64 };
}
