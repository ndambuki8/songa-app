import { File } from 'expo-file-system';

import { fail, ok, type ApiResult } from './result';

export async function readFileAsBase64(uri: string): Promise<ApiResult<string>> {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return fail({ kind: 'bad_request', message: 'The recording could not be found on this device.' });
    }
    return ok(await file.base64());
  } catch {
    return fail({ kind: 'bad_request', message: 'The recording could not be read from this device.' });
  }
}
