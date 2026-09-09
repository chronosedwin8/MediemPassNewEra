import {
  ALL_PERMISSIONS,
  ROLE,
  ROLE_PERMISSIONS,
  USER_STATUS,
  splitPermission,
  type Permission,
  type Role,
} from '@medienpass/shared';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { hashPassword } from '../../src/shared/security/password.js';

/**
 * Fábricas para pruebas de integración.
 *
 * Crean lo mínimo indispensable con valores por defecto sensatos, de modo que
 * cada prueba declare solo aquello que le importa. Una prueba que necesita un
 * docente no debería tener que saber qué permisos lleva el rol.
 */

export const TEST_PASSWORD = 'Contrasena123';

/** Siembra roles y permisos. Necesario en cualquier prueba con autenticación. */
export async function seedRolesAndPermissions(): Promise<void> {
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((code) => {
      const { resource, action } = splitPermission(code);
      return { code, resource, action };
    }),
    skipDuplicates: true,
  });

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS) as [Role, Permission[]][]) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name: { es: code, de: code, en: code }, isSystem: true },
      update: {},
    });

    const rows = await prisma.permission.findMany({
      where: { code: { in: [...permissions] } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: rows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }
}

interface CreateUserOptions {
  username?: string;
  email?: string | null;
  role?: Role;
  password?: string | null;
  status?: string;
  firstName?: string;
  lastName?: string;
}

export interface TestUser {
  id: string;
  username: string;
  email: string | null;
  password: string;
}

let userCounter = 0;

export async function createUser(options: CreateUserOptions = {}): Promise<TestUser> {
  userCounter += 1;
  const username = options.username ?? `usuario${userCounter}`;
  const email =
    options.email === null ? null : (options.email ?? `${username}@colegioaleman.edu.co`);
  const password = options.password === null ? null : (options.password ?? TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      firstName: options.firstName ?? 'Nombre',
      lastName: options.lastName ?? 'Apellido',
      status: (options.status ?? USER_STATUS.ACTIVE) as never,
      passwordHash: password ? await hashPassword(password) : null,
      passwordUpdatedAt: password ? new Date() : null,
    },
  });

  if (options.role) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: options.role } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return { id: user.id, username, email, password: password ?? '' };
}

export const createAdmin = (options: CreateUserOptions = {}): Promise<TestUser> =>
  createUser({ ...options, role: ROLE.ADMIN });

export const createTeacher = (options: CreateUserOptions = {}): Promise<TestUser> =>
  createUser({ ...options, role: ROLE.TEACHER });

export const createStudent = (options: CreateUserOptions = {}): Promise<TestUser> =>
  createUser({ ...options, role: ROLE.STUDENT });
