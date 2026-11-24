/** An error from a Prism app, with a message fit to show the user as-is. */
export class PrismAppError extends Error {
  name = "PrismAppError";
}

export interface GetOptions {
  app: string;
  timeoutMs: number;
}

function connectionError(error: unknown, url: URL, { app, timeoutMs }: GetOptions): PrismAppError {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new PrismAppError(`${app} on ${url.host} didn't answer within ${timeoutMs / 1000} s`);
  }
  return new PrismAppError(`${app} isn't running on ${url.host}`);
}

/** GET a JSON document from a Prism app. This client never sends any other method. */
export async function getJson(baseUrl: string, path: string, options: GetOptions): Promise<unknown> {
  const url = new URL(path, baseUrl);
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(options.timeoutMs) });
  } catch (error) {
    throw connectionError(error, url, options);
  }
  if (!response.ok) throw new PrismAppError(`${options.app} returned HTTP ${response.status} for ${url.pathname}`);
  try {
    return await response.json();
  } catch (error) {
    throw error instanceof Error && error.name === "TimeoutError"
      ? connectionError(error, url, options)
      : new PrismAppError(`${options.app} returned invalid JSON`);
  }
}
