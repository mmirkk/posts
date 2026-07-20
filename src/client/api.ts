interface ApiErrorBody {
  error?: unknown;
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  let body: unknown;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text.trim() || `El servidor devolvió una respuesta inválida (${response.status})`);
  }

  if (!response.ok) {
    const error = body as ApiErrorBody | null;
    const message = typeof error?.error === "string" ? error.error : `La solicitud falló (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}
