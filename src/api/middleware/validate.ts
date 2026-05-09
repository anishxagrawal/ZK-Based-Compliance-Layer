/**
 * Reusable Zod-based request body validation middleware.
 */

import { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

export function validateBody<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: "Invalid request body.", details: result.error.flatten() });
      return;
    }

    req.body = result.data;
    next();
  };
}
