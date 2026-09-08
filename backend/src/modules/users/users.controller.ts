import type { Request, Response } from 'express';
import { created, noContent, ok, paginated } from '../../shared/http/response.js';
import { getQuery } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/authenticate.js';
import type { Role } from '@medienpass/shared';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.dto.js';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  resetUserPassword,
  setUserRoles,
  updateUser,
} from './users.service.js';

/** Traduce entre HTTP y el servicio. Sin reglas de negocio. */

export async function listUsersController(req: Request, res: Response): Promise<void> {
  const result = await listUsers(getQuery<ListUsersQuery>(req));
  paginated(res, result.items, result.meta);
}

export async function getUserController(req: Request, res: Response): Promise<void> {
  ok(res, await getUser(req.params['id']!));
}

export async function createUserController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  created(res, await createUser(req.body as CreateUserInput, auth.userId));
}

export async function updateUserController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await updateUser(req.params['id']!, req.body as UpdateUserInput, auth.userId));
}

export async function setRolesController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { roles } = req.body as { roles: Role[] };
  ok(res, await setUserRoles(req.params['id']!, roles, auth.userId));
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { password } = req.body as { password?: string };
  ok(res, await resetUserPassword(req.params['id']!, password, auth.userId));
}

export async function deleteUserController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  await deleteUser(req.params['id']!, auth.userId);
  noContent(res);
}
