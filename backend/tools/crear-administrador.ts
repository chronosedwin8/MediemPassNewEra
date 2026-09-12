import { randomBytes } from 'node:crypto';
import { ROLE, USER_STATUS } from '@medienpass/shared';
import { prisma } from '../src/infrastructure/database/prisma.js';
import { hashPassword } from '../src/shared/security/password.js';

/**
 * Crea el primer administrador de una instalación.
 *
 *   node backend/dist/admin.js
 *
 * Hasta ahora la única cuenta de administración nacía dentro de los datos de
 * demostración, que en producción no se siembran. El resultado era una
 * plataforma desplegada, migrada y sembrada en la que nadie podía entrar: sin
 * administrador no hay forma de crear usuarios ni de asignar roles, y la
 * salida pasaba por escribir en la base a mano.
 *
 * Se niega a ejecutarse si ya existe un administrador activo. Es lo que lo
 * hace seguro de dejar en el arranque de un despliegue: la segunda vez no
 * hace nada, en lugar de reabrir una puerta que alguien creía cerrada.
 *
 * La contraseña sale por pantalla **una sola vez** y la cuenta queda obligada
 * a cambiarla al entrar. No se guarda en claro en ningún sitio, así que si se
 * pierde hay que restablecerla desde otra cuenta de administración.
 */

/** Sin `l I 1 O 0`: se dictan por teléfono y se copian a mano. */
const LEGIBLES = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarContrasena(largo = 18): string {
  const bytes = randomBytes(largo);
  let salida = '';
  for (const byte of bytes) {
    salida += LEGIBLES[byte % LEGIBLES.length];
  }
  // Una mayúscula, una minúscula y un dígito garantizados: el alfabeto los
  // tiene todos, pero al azar puede salir una tirada sin ninguno y la política
  // de contraseñas la rechazaría.
  return `${salida}Aa7`;
}

async function main(): Promise<void> {
  const existentes = await prisma.user.count({
    where: {
      deletedAt: null,
      status: USER_STATUS.ACTIVE,
      roles: { some: { role: { code: ROLE.ADMIN } } },
    },
  });

  if (existentes > 0) {
    console.warn(
      `Ya hay ${existentes} administrador(es) activo(s). No se crea ninguno.\n` +
        'Para dar acceso a alguien más, hágalo desde la plataforma.',
    );
    return;
  }

  const username = process.env['ADMIN_USERNAME']?.trim() || 'admin';
  const email = process.env['ADMIN_EMAIL']?.trim() || null;
  const contrasena = process.env['ADMIN_PASSWORD']?.trim() || generarContrasena();
  const generada = !process.env['ADMIN_PASSWORD'];

  const rol = await prisma.role.findUnique({ where: { code: ROLE.ADMIN } });
  if (!rol) {
    throw new Error('No existe el rol de administrador. Ejecute la semilla antes que esto.');
  }

  const usuario = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      email,
      firstName: 'Administración',
      lastName: 'Medienpass',
      status: USER_STATUS.ACTIVE,
      passwordHash: await hashPassword(contrasena),
      passwordUpdatedAt: new Date(),
      mustChangePassword: true,
    },
    update: {
      status: USER_STATUS.ACTIVE,
      passwordHash: await hashPassword(contrasena),
      passwordUpdatedAt: new Date(),
      mustChangePassword: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: usuario.id, roleId: rol.id } },
    create: { userId: usuario.id, roleId: rol.id },
    update: {},
  });

  console.warn(`\nAdministrador listo: ${username}`);
  if (generada) {
    console.warn(`Contraseña: ${contrasena}`);
    console.warn('Anótela ahora. No vuelve a mostrarse y habrá que cambiarla al entrar.\n');
  } else {
    console.warn('Con la contraseña indicada en ADMIN_PASSWORD. Habrá que cambiarla al entrar.\n');
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
