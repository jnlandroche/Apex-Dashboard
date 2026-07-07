import { Request, Response, NextFunction } from "express";

/**
 * Optional API key guard for mutating endpoints.
 * When DASHBOARD_API_KEY is not set, all requests pass through.
 * When set, the request must include `x-api-key: <key>` to proceed.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.DASHBOARD_API_KEY;
  if (!configured) {
    next();
    return;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== configured) {
    res.status(401).json({ error: "Unauthorized — invalid or missing x-api-key header" });
    return;
  }
  next();
}
