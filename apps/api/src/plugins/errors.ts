import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DealTransitionError, PoolError, OfferError, ListingError, AuctionError } from "@malsatu/shared";

/** Единый формат ошибок: { error: { code, message, details? } }. Сообщения kk/ru подбирает фронт по code. */
export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) { super(message ?? code); }
}
export const notFound = (code = "not_found") => new AppError(404, code);
export const forbidden = (code = "forbidden") => new AppError(403, code);
export const badRequest = (code: string, details?: unknown) => new AppError(400, code, undefined, details);
export const conflict = (code: string) => new AppError(409, code);

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: "validation", details: err.flatten() } });
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof DealTransitionError || err instanceof PoolError || err instanceof OfferError || err instanceof ListingError || err instanceof AuctionError)
      return reply.status(409).send({ error: { code: err.code, message: err.message } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: "rate_limited" } });
    if (err.validation) return reply.status(400).send({ error: { code: "validation", details: err.validation } });
    req.log.error({ err }, "unhandled error");
    return reply.status(err.statusCode ?? 500).send({ error: { code: "internal", message: process.env.NODE_ENV === "production" ? undefined : err.message } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "route_not_found" } }));
}
