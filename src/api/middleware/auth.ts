/**
 * Middleware that enforces API key authentication for incoming requests.
 */

import { NextFunction, Request, Response } from "express";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredApiKey = process.env.API_KEY;

  if (!configuredApiKey) {
    res.status(500).json({ error: "API key is not configured on server." });
    return;
  }

  const requestApiKey = req.header("x-api-key");
  if (requestApiKey !== configuredApiKey) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  next();
}
