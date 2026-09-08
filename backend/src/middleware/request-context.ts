import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Asigna un identificador a cada petición.
 *
 * Va en la respuesta y en cada línea de registro relacionada, de modo que
 * cuando alguien reporta "me salió un error", ese identificador lleva
 * directamente a la traza exacta.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.locals['requestId'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};
