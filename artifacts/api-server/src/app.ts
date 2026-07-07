import express, { type Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production, allow only the Replit-assigned domains. In development, allow
// all origins so the Vite dev server can reach the API without friction.
const allowedOrigins: string[] = [];
if (process.env.REPLIT_DOMAINS) {
  for (const d of process.env.REPLIT_DOMAINS.split(",")) {
    const trimmed = d.trim();
    if (trimmed) allowedOrigins.push(`https://${trimmed}`);
  }
}

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin: (origin, cb) => {
            // Allow same-origin / no-origin requests (server-to-server, curl)
            if (!origin) return cb(null, true);
            if (allowedOrigins.some((o) => origin === o || origin.endsWith(`.${o.replace("https://", "")}`)))
              return cb(null, true);
            cb(new Error(`CORS: origin ${origin} not allowed`));
          },
          credentials: true,
        }
      : undefined, // open CORS in development
  ),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Global error handler ───────────────────────────────────────────────────────
// Catches any error thrown (or passed to next()) from route handlers.
// Express 5 propagates async errors automatically, so this fires for both.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === "object" && err !== null && "httpStatus" in err
      ? ((err as { httpStatus?: number }).httpStatus ?? 500)
      : 500;

  const message =
    err instanceof Error ? err.message : "Internal server error";

  // Log at warn for client errors, error for server faults
  if (status >= 500) {
    req.log.error({ err }, "Unhandled server error");
  } else {
    req.log.warn({ err }, "Request error");
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
