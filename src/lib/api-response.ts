/**
 * 线上 Worker 异常时可能返回空响应或非 JSON 响应。
 * 客户端统一将其转换为可展示的错误，避免页面直接暴露 JSON 解析异常。
 */
export async function readJsonResponse<T extends { error?: string }>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = await response.text();

  if (!body.trim()) {
    return { error: fallback } as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return { error: fallback } as T;
  }
}
