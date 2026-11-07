export async function readResponseError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return body?.error ?? "Не удалось выполнить запрос.";
}
