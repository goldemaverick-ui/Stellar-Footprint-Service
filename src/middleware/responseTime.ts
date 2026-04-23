import { Request, Response, NextFunction } from "express";

/**
 * Middleware to add X-Response-Time header showing request processing duration in milliseconds
 */
export function responseTimeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();

  // Override res.json to capture when response is sent
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const duration = Date.now() - startTime;
    res.set("X-Response-Time", `${duration.toFixed(2)}ms`);
    return originalJson(body);
  };

  // Also handle res.end for non-JSON responses
  const originalEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, encoding?: BufferEncoding | (() => void)) {
    if (!res.get("X-Response-Time")) {
      const duration = Date.now() - startTime;
      res.set("X-Response-Time", `${duration.toFixed(2)}ms`);
    }
    if (typeof encoding === "function") {
      return originalEnd(chunk, encoding);
    }
    return originalEnd(chunk, encoding);
  };

  next();
}
