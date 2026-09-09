import type { PrismaClient } from '@prisma/client';
import {
  ASSESSMENT_AUDIENCE,
  ASSESSMENT_VERSION_STATUS,
  ENROLLMENT_STATUS,
  QUESTION_TYPE,
  ROLE,
  USER_STATUS,
  parseQuestionPayload,
  type QuestionType,
} from '@medienpass/shared';
import { hashPassword } from '../../src/shared/security/password.js';

/**
 * Datos de demostración.
 *
 * Permiten recorrer el sistema completo sin depender de Phidias ni de datos
 * personales reales: 1 administrador, 3 docentes, 30 estudiantes, 4 grupos y
 * 3 evaluaciones publicadas que ejercitan la mayoría de tipos de pregunta.
 *
 * Nada de esto se siembra en producción: `seedDemo` solo se invoca cuando se
 * pide explícitamente.
 */

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Medienpass2026!';

const TEACHERS = [
  {
    username: 'laura.medina',
    email: 'laura.medina@colegioaleman.edu.co',
    firstName: 'Laura',
    lastName: 'Medina Ruiz',
    areaCode: 'MAT',
    subjectCodes: ['MAT-GEN', 'MAT-GEO'],
  },
  {
    username: 'stefan.brandt',
    email: 'stefan.brandt@colegioaleman.edu.co',
    firstName: 'Stefan',
    lastName: 'Brandt',
    areaCode: 'TEC',
    subjectCodes: ['INF', 'TEC-GEN'],
  },
  {
    username: 'carolina.pardo',
    email: 'carolina.pardo@colegioaleman.edu.co',
    firstName: 'Carolina',
    lastName: 'Pardo Vélez',
    areaCode: 'CNAT',
    subjectCodes: ['BIO', 'QUI'],
  },
];

const FIRST_NAMES = [
  'Sofía',
  'Mateo',
  'Valentina',
  'Samuel',
  'Isabella',
  'Lukas',
  'Emilia',
  'Tomás',
  'Mariana',
  'Jonas',
  'Camila',
  'Daniel',
  'Antonia',
  'Felipe',
  'Greta',
  'Nicolás',
  'Luciana',
  'Sebastián',
  'Helena',
  'Andrés',
  'Paulina',
  'Martín',
  'Elena',
  'Diego',
  'Clara',
  'Julián',
  'Renata',
  'Emilio',
  'Alina',
  'Santiago',
];

const LAST_NAMES = [
  'Restrepo Gómez',
  'Vargas Lindo',
  'Schmidt Ríos',
  'Ospina Daza',
  'Weber Cortés',
  'Molina Barros',
  'Klein Ardila',
  'Navarro Ruiz',
  'Fischer Osorio',
  'Cabrera León',
];

interface QuestionSeed {
  type: QuestionType;
  statement: string;
  points: number;
  competencyCode: string;
  subcompetencyCode?: string;
  feedbackCorrect: string;
  feedbackIncorrect: string;
  payload: unknown;
}

interface AssessmentSeed {
  title: string;
  description: string;
  instructions: string;
  audience: 'STUDENT' | 'TEACHER';
  purpose: 'EVALUATION' | 'TRAINING';
  subjectCode?: string;
  areaCode?: string;
  gradeCode?: string;
  teacherUsername: string;
  timeLimitMinutes: number;
  questions: QuestionSeed[];
}

const ASSESSMENTS: AssessmentSeed[] = [
  {
    title: 'Búsqueda y evaluación de fuentes digitales',
    description:
      'Evaluación diagnóstica sobre cómo localizar información en internet y juzgar su fiabilidad.',
    instructions:
      'Lee cada pregunta con calma. Puedes navegar entre preguntas y cambiar tus respuestas antes de finalizar.',
    audience: 'STUDENT',
    purpose: 'EVALUATION',
    subjectCode: 'INF',
    areaCode: 'TEC',
    gradeCode: 'K8',
    teacherUsername: 'stefan.brandt',
    timeLimitMinutes: 30,
    questions: [
      {
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement:
          '¿Cuál de estas señales indica mejor que una página web es una fuente confiable para un trabajo escolar?',
        points: 2,
        competencyCode: '1',
        subcompetencyCode: '1.2',
        feedbackCorrect:
          'Correcto. La autoría identificable y las referencias verificables son el indicio más sólido de fiabilidad.',
        feedbackIncorrect:
          'El diseño, la posición en el buscador o la cantidad de visitas no dicen nada sobre la veracidad del contenido.',
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Aparece en el primer lugar del buscador', correct: false },
            { id: 'b', text: 'Indica quién la escribe y cita sus fuentes', correct: true },
            { id: 'c', text: 'Tiene un diseño moderno y atractivo', correct: false },
            { id: 'd', text: 'Muchas personas la han compartido', correct: false },
          ],
        },
      },
      {
        type: QUESTION_TYPE.MULTIPLE_CHOICE,
        statement:
          'Selecciona todas las estrategias que hacen más precisa una búsqueda en internet.',
        points: 3,
        competencyCode: '1',
        subcompetencyCode: '1.1',
        feedbackCorrect:
          'Muy bien: has identificado los operadores de búsqueda que acotan resultados.',
        feedbackIncorrect:
          'Repasa los operadores de búsqueda: las comillas, el filtro por sitio y la exclusión con guion.',
        payload: {
          kind: QUESTION_TYPE.MULTIPLE_CHOICE,
          partialCredit: true,
          penalizeIncorrect: true,
          options: [
            { id: 'a', text: 'Usar comillas para buscar una frase exacta', correct: true },
            { id: 'b', text: 'Escribir la búsqueda siempre en mayúsculas', correct: false },
            { id: 'c', text: 'Restringir a un dominio con site:', correct: true },
            { id: 'd', text: 'Excluir palabras con el signo menos', correct: true },
            { id: 'e', text: 'Añadir muchos signos de admiración', correct: false },
          ],
        },
      },
      {
        type: QUESTION_TYPE.TRUE_FALSE,
        statement:
          'Si dos páginas distintas dicen lo mismo, la información queda automáticamente verificada.',
        points: 1,
        competencyCode: '6',
        subcompetencyCode: '6.1',
        feedbackCorrect:
          'Exacto. Ambas pueden haber copiado la misma fuente errónea: hay que comprobar el origen.',
        feedbackIncorrect:
          'La repetición no es verificación: dos sitios pueden proceder de la misma fuente equivocada.',
        payload: { kind: QUESTION_TYPE.TRUE_FALSE, correct: false },
      },
      {
        type: QUESTION_TYPE.ORDERING,
        statement: 'Ordena los pasos de una búsqueda de información bien planteada.',
        points: 3,
        competencyCode: '1',
        subcompetencyCode: '1.1',
        feedbackCorrect: 'Correcto: definir antes de buscar evita perderse entre resultados.',
        feedbackIncorrect: 'Recuerda que buscar es el tercer paso, no el primero.',
        payload: {
          kind: QUESTION_TYPE.ORDERING,
          partialCredit: true,
          items: [
            { id: 'i1', text: 'Definir con precisión qué quiero averiguar', correctPosition: 0 },
            { id: 'i2', text: 'Elegir palabras clave y operadores', correctPosition: 1 },
            { id: 'i3', text: 'Buscar y revisar varios resultados', correctPosition: 2 },
            { id: 'i4', text: 'Contrastar las fuentes entre sí', correctPosition: 3 },
            { id: 'i5', text: 'Guardar y citar lo que voy a usar', correctPosition: 4 },
          ],
        },
      },
      {
        type: QUESTION_TYPE.SHORT_ANSWER,
        statement:
          '¿Qué operador escribes delante de un dominio para limitar la búsqueda a ese sitio web?',
        points: 2,
        competencyCode: '1',
        subcompetencyCode: '1.1',
        feedbackCorrect: 'Correcto: site: limita los resultados a un dominio concreto.',
        feedbackIncorrect: 'El operador es site: seguido del dominio, sin espacios.',
        payload: {
          kind: QUESTION_TYPE.SHORT_ANSWER,
          acceptedAnswers: ['site:', 'site', 'operador site'],
          caseSensitive: false,
          ignoreAccents: true,
        },
      },
      {
        type: QUESTION_TYPE.OPEN_TEXT,
        statement:
          'Explica con tus palabras cómo comprobarías si una noticia que ves en redes sociales es cierta.',
        points: 4,
        competencyCode: '6',
        subcompetencyCode: '6.1',
        feedbackCorrect: 'Tu docente revisará esta respuesta y te dará retroalimentación.',
        feedbackIncorrect: 'Tu docente revisará esta respuesta y te dará retroalimentación.',
        payload: {
          kind: QUESTION_TYPE.OPEN_TEXT,
          minWords: 30,
          maxWords: 200,
          rubric:
            'Menciona al menos: buscar la fuente original, comprobar la fecha, contrastar con medios reconocidos y desconfiar de titulares emocionales.',
        },
      },
    ],
  },
  {
    title: 'Funciones lineales con herramientas digitales',
    description:
      'Resolución de problemas con funciones lineales apoyándose en calculadoras gráficas y hojas de cálculo.',
    instructions: 'Dispones de 45 minutos. Puedes usar papel para tus cálculos.',
    audience: 'STUDENT',
    purpose: 'EVALUATION',
    subjectCode: 'MAT-GEN',
    areaCode: 'MAT',
    gradeCode: 'K8',
    teacherUsername: 'laura.medina',
    timeLimitMinutes: 45,
    questions: [
      {
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement: 'En la función y = 3x + 5, ¿qué representa el número 3?',
        points: 2,
        competencyCode: '5',
        subcompetencyCode: '5.4',
        feedbackCorrect: 'Correcto: el coeficiente de x es la pendiente e indica la inclinación.',
        feedbackIncorrect: 'El 3 acompaña a x: es la pendiente. El 5 es la ordenada en el origen.',
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'La pendiente de la recta', correct: true },
            { id: 'b', text: 'El punto donde corta el eje Y', correct: false },
            { id: 'c', text: 'El valor de y cuando x vale 0', correct: false },
            { id: 'd', text: 'La raíz de la función', correct: false },
          ],
        },
      },
      {
        type: QUESTION_TYPE.FILL_BLANK,
        statement: 'Completa la descripción de la función y = -2x + 7.',
        points: 3,
        competencyCode: '5',
        subcompetencyCode: '5.5',
        feedbackCorrect: 'Correcto: pendiente negativa significa que la recta desciende.',
        feedbackIncorrect: 'La pendiente es -2 y la ordenada en el origen es 7.',
        payload: {
          kind: QUESTION_TYPE.FILL_BLANK,
          template:
            'La pendiente vale {{m}}, por lo que la recta es {{dir}}, y corta el eje Y en {{b}}.',
          blanks: [
            { id: 'm', acceptedAnswers: ['-2', '−2'], caseSensitive: false, ignoreAccents: true },
            {
              id: 'dir',
              acceptedAnswers: ['decreciente', 'descendente'],
              caseSensitive: false,
              ignoreAccents: true,
            },
            {
              id: 'b',
              acceptedAnswers: ['7', '(0,7)', '(0, 7)'],
              caseSensitive: false,
              ignoreAccents: true,
            },
          ],
        },
      },
      {
        type: QUESTION_TYPE.MATCHING,
        statement: 'Relaciona cada función con la descripción de su gráfica.',
        points: 4,
        competencyCode: '5',
        subcompetencyCode: '5.4',
        feedbackCorrect: 'Muy bien: has relacionado correctamente pendiente y comportamiento.',
        feedbackIncorrect: 'Fíjate en el signo de la pendiente y en el término independiente.',
        payload: {
          kind: QUESTION_TYPE.MATCHING,
          partialCredit: true,
          left: [
            { id: 'f1', text: 'y = 2x' },
            { id: 'f2', text: 'y = -x + 4' },
            { id: 'f3', text: 'y = 5' },
            { id: 'f4', text: 'y = 0,5x - 3' },
          ],
          right: [
            { id: 'd1', text: 'Recta creciente que pasa por el origen' },
            { id: 'd2', text: 'Recta decreciente que corta el eje Y en 4' },
            { id: 'd3', text: 'Recta horizontal' },
            { id: 'd4', text: 'Recta creciente suave que corta el eje Y en -3' },
          ],
          pairs: [
            { leftId: 'f1', rightId: 'd1' },
            { leftId: 'f2', rightId: 'd2' },
            { leftId: 'f3', rightId: 'd3' },
            { leftId: 'f4', rightId: 'd4' },
          ],
        },
      },
      {
        type: QUESTION_TYPE.GROUPING,
        statement: 'Clasifica cada herramienta según para qué resulta más adecuada.',
        points: 3,
        competencyCode: '5',
        subcompetencyCode: '5.2',
        feedbackCorrect: 'Correcto: cada herramienta tiene un uso donde rinde mejor.',
        feedbackIncorrect: 'Revisa qué hace cada herramienta antes de clasificarla.',
        payload: {
          kind: QUESTION_TYPE.GROUPING,
          partialCredit: true,
          groups: [
            { id: 'g1', label: 'Representar gráficamente una función' },
            { id: 'g2', label: 'Calcular con muchos datos' },
          ],
          items: [
            { id: 'it1', text: 'GeoGebra', groupId: 'g1' },
            { id: 'it2', text: 'Desmos', groupId: 'g1' },
            { id: 'it3', text: 'Hoja de cálculo', groupId: 'g2' },
            { id: 'it4', text: 'Tabla dinámica', groupId: 'g2' },
          ],
        },
      },
      {
        type: QUESTION_TYPE.TRUE_FALSE,
        statement:
          'Dos rectas con la misma pendiente nunca se cortan, salvo que sean la misma recta.',
        points: 1,
        competencyCode: '5',
        subcompetencyCode: '5.5',
        feedbackCorrect: 'Correcto: misma pendiente significa rectas paralelas.',
        feedbackIncorrect: 'Rectas con igual pendiente son paralelas: o no se cortan, o coinciden.',
        payload: { kind: QUESTION_TYPE.TRUE_FALSE, correct: true },
      },
    ],
  },
  {
    title: 'Capacitación KMK 4 — Proteger y actuar de forma segura',
    description:
      'Evaluación del módulo de formación docente sobre seguridad digital y protección de datos personales.',
    instructions:
      'Esta evaluación forma parte de su capacitación en competencias digitales. Se aprueba con el 80 %.',
    audience: 'TEACHER',
    purpose: 'TRAINING',
    areaCode: 'TEC',
    teacherUsername: 'stefan.brandt',
    timeLimitMinutes: 25,
    questions: [
      {
        type: QUESTION_TYPE.SINGLE_CHOICE,
        statement:
          '¿Cuál es la práctica más eficaz para proteger las cuentas institucionales del profesorado?',
        points: 3,
        competencyCode: '4',
        subcompetencyCode: '4.1',
        feedbackCorrect:
          'Correcto. El segundo factor detiene la inmensa mayoría de los accesos no autorizados.',
        feedbackIncorrect:
          'Cambiar la contraseña con frecuencia o alargarla ayuda menos que activar un segundo factor.',
        payload: {
          kind: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Cambiar la contraseña cada semana', correct: false },
            { id: 'b', text: 'Activar la verificación en dos pasos', correct: true },
            { id: 'c', text: 'Usar una contraseña muy larga y reutilizarla', correct: false },
            {
              id: 'd',
              text: 'Anotar la contraseña en un lugar seguro del escritorio',
              correct: false,
            },
          ],
        },
      },
      {
        type: QUESTION_TYPE.MULTIPLE_CHOICE,
        statement:
          'Al compartir material con calificaciones de estudiantes, ¿qué medidas son obligatorias?',
        points: 4,
        competencyCode: '4',
        subcompetencyCode: '4.2',
        feedbackCorrect: 'Correcto: minimizar los datos y controlar quién accede es lo esencial.',
        feedbackIncorrect:
          'La protección de datos exige compartir lo mínimo necesario y solo con quien corresponde.',
        payload: {
          kind: QUESTION_TYPE.MULTIPLE_CHOICE,
          partialCredit: true,
          penalizeIncorrect: true,
          options: [
            { id: 'a', text: 'Compartir solo con las personas que deben verlo', correct: true },
            {
              id: 'b',
              text: 'Incluir el documento de identidad para evitar confusiones',
              correct: false,
            },
            { id: 'c', text: 'Usar los canales institucionales, no personales', correct: true },
            { id: 'd', text: 'Limitar la información a la estrictamente necesaria', correct: true },
            {
              id: 'e',
              text: 'Publicar el listado completo en un grupo de mensajería',
              correct: false,
            },
          ],
        },
      },
      {
        type: QUESTION_TYPE.TRUE_FALSE,
        statement:
          'Un correo que parece del colegio y pide credenciales con urgencia puede ser un intento de suplantación.',
        points: 2,
        competencyCode: '4',
        subcompetencyCode: '4.1',
        feedbackCorrect: 'Exacto: la urgencia es una de las señales más habituales de phishing.',
        feedbackIncorrect:
          'La urgencia y la petición de credenciales son señales clásicas de phishing.',
        payload: { kind: QUESTION_TYPE.TRUE_FALSE, correct: true },
      },
      {
        type: QUESTION_TYPE.OPEN_TEXT,
        statement:
          'Describa cómo actuaría si detecta que un estudiante ha publicado datos personales de un compañero.',
        points: 5,
        competencyCode: '4',
        subcompetencyCode: '4.2',
        feedbackCorrect: 'La coordinación revisará su respuesta.',
        feedbackIncorrect: 'La coordinación revisará su respuesta.',
        payload: {
          kind: QUESTION_TYPE.OPEN_TEXT,
          minWords: 40,
          maxWords: 300,
          rubric:
            'Debe contemplar: retirar el contenido, informar a coordinación y a las familias, y abordarlo pedagógicamente con el grupo.',
        },
      },
    ],
  },
];

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [adminRole, teacherRole, studentRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { code: ROLE.ADMIN } }),
    prisma.role.findUniqueOrThrow({ where: { code: ROLE.TEACHER } }),
    prisma.role.findUniqueOrThrow({ where: { code: ROLE.STUDENT } }),
  ]);

  // --- Administrador -------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      email: 'admin@colegioaleman.edu.co',
      firstName: 'Administración',
      lastName: 'Medienpass',
      status: USER_STATUS.ACTIVE,
      passwordHash,
      passwordUpdatedAt: new Date(),
    },
    update: { status: USER_STATUS.ACTIVE, passwordHash },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  // --- Docentes ------------------------------------------------------------
  const teacherIdByUsername = new Map<string, string>();

  for (const teacherSeed of TEACHERS) {
    const user = await prisma.user.upsert({
      where: { username: teacherSeed.username },
      create: {
        username: teacherSeed.username,
        email: teacherSeed.email,
        firstName: teacherSeed.firstName,
        lastName: teacherSeed.lastName,
        status: USER_STATUS.ACTIVE,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
      update: { status: USER_STATUS.ACTIVE, passwordHash },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: teacherRole.id } },
      create: { userId: user.id, roleId: teacherRole.id },
      update: {},
    });

    const teacher = await prisma.teacher.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        employeeCode: `DOC-${teacherSeed.username.slice(0, 6).toUpperCase()}`,
      },
      update: {},
    });

    const area = await prisma.academicArea.findUniqueOrThrow({
      where: { code: teacherSeed.areaCode },
    });
    await prisma.teacherArea.upsert({
      where: { teacherId_areaId: { teacherId: teacher.id, areaId: area.id } },
      create: { teacherId: teacher.id, areaId: area.id, isPrimary: true },
      update: { isPrimary: true },
    });

    for (const subjectCode of teacherSeed.subjectCodes) {
      const subject = await prisma.subject.findUniqueOrThrow({ where: { code: subjectCode } });
      await prisma.teacherSubject.upsert({
        where: { teacherId_subjectId: { teacherId: teacher.id, subjectId: subject.id } },
        create: { teacherId: teacher.id, subjectId: subject.id },
        update: {},
      });
    }

    teacherIdByUsername.set(teacherSeed.username, user.id);
  }

  // --- Grupos --------------------------------------------------------------
  const year = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });

  const groupDefinitions = [
    { code: 'K8A', gradeCode: 'K8', teacher: 'laura.medina', subjectCode: 'MAT-GEN' },
    { code: 'K8B', gradeCode: 'K8', teacher: 'stefan.brandt', subjectCode: 'INF' },
    { code: 'K10A', gradeCode: 'K10', teacher: 'carolina.pardo', subjectCode: 'BIO' },
    { code: 'K10B', gradeCode: 'K10', teacher: 'stefan.brandt', subjectCode: 'INF' },
  ];

  const groups: Array<{ id: string; code: string }> = [];

  for (const definition of groupDefinitions) {
    const gradeLevel = await prisma.gradeLevel.findUniqueOrThrow({
      where: { code: definition.gradeCode },
    });
    const subject = await prisma.subject.findUniqueOrThrow({
      where: { code: definition.subjectCode },
    });
    const group = await prisma.group.upsert({
      where: { academicYearId_code: { academicYearId: year.id, code: definition.code } },
      create: {
        academicYearId: year.id,
        gradeLevelId: gradeLevel.id,
        subjectId: subject.id,
        homeroomTeacherId: teacherIdByUsername.get(definition.teacher),
        code: definition.code,
        name: definition.code,
      },
      update: { homeroomTeacherId: teacherIdByUsername.get(definition.teacher) },
    });
    groups.push({ id: group.id, code: group.code });
  }

  // --- Estudiantes ---------------------------------------------------------
  for (let index = 0; index < 30; index += 1) {
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length]!;
    const lastName = LAST_NAMES[index % LAST_NAMES.length]!;
    const username = `${slugify(firstName)}.${slugify(lastName.split(' ')[0]!)}${index}`;

    const user = await prisma.user.upsert({
      where: { username },
      create: {
        username,
        email: `${username}@colegioaleman.edu.co`,
        firstName,
        lastName,
        status: USER_STATUS.ACTIVE,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
      update: { status: USER_STATUS.ACTIVE, passwordHash },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: studentRole.id } },
      create: { userId: user.id, roleId: studentRole.id },
      update: {},
    });

    const group = groups[index % groups.length]!;
    const gradeCode = group.code.startsWith('K8') ? 'K8' : 'K10';
    const gradeLevel = await prisma.gradeLevel.findUniqueOrThrow({ where: { code: gradeCode } });

    const student = await prisma.student.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        code: `DEMO-${String(1000 + index)}`,
        gradeLevelId: gradeLevel.id,
        enrollmentStatus: ENROLLMENT_STATUS.ACTIVE,
      },
      update: { gradeLevelId: gradeLevel.id, enrollmentStatus: ENROLLMENT_STATUS.ACTIVE },
    });

    await prisma.groupMembership.upsert({
      where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
      create: { groupId: group.id, studentId: student.id },
      update: { active: true },
    });
  }

  // --- Evaluaciones publicadas ---------------------------------------------
  const studentScale = await prisma.gradingScale.findFirstOrThrow({
    where: { code: 'student-default', isActive: true },
  });
  const teacherScale = await prisma.gradingScale.findFirstOrThrow({
    where: { code: 'teacher-default', isActive: true },
  });

  for (const seed of ASSESSMENTS) {
    const createdById = teacherIdByUsername.get(seed.teacherUsername);
    if (!createdById) continue;

    const existing = await prisma.assessment.findFirst({ where: { title: seed.title } });
    if (existing) continue;

    const subject = seed.subjectCode
      ? await prisma.subject.findUniqueOrThrow({ where: { code: seed.subjectCode } })
      : null;
    const area = seed.areaCode
      ? await prisma.academicArea.findUniqueOrThrow({ where: { code: seed.areaCode } })
      : null;
    const gradeLevel = seed.gradeCode
      ? await prisma.gradeLevel.findUniqueOrThrow({ where: { code: seed.gradeCode } })
      : null;

    const assessment = await prisma.assessment.create({
      data: {
        title: seed.title,
        audience: seed.audience,
        purpose: seed.purpose,
        subjectId: subject?.id ?? null,
        areaId: area?.id ?? null,
        gradeLevelId: gradeLevel?.id ?? null,
        createdById,
      },
    });

    const totalPoints = seed.questions.reduce((sum, question) => sum + question.points, 0);

    const version = await prisma.assessmentVersion.create({
      data: {
        assessmentId: assessment.id,
        versionNumber: 1,
        status: ASSESSMENT_VERSION_STATUS.PUBLISHED,
        name: seed.title,
        description: seed.description,
        instructions: seed.instructions,
        timeLimitMinutes: seed.timeLimitMinutes,
        gradingScaleId:
          seed.audience === ASSESSMENT_AUDIENCE.TEACHER ? teacherScale.id : studentScale.id,
        totalPoints,
        questionCount: seed.questions.length,
        publishedAt: new Date(),
        publishedById: createdById,
      },
    });

    for (const [position, question] of seed.questions.entries()) {
      const competency = await prisma.kmkCompetency.findUniqueOrThrow({
        where: { code: question.competencyCode },
      });
      const subcompetency = question.subcompetencyCode
        ? await prisma.kmkSubcompetency.findUnique({ where: { code: question.subcompetencyCode } })
        : null;

      // Se valida con el mismo esquema que usará la API: si un dato de
      // demostración fuera inválido, es preferible descubrirlo aquí.
      const payload = parseQuestionPayload(question.type, question.payload);

      await prisma.question.create({
        data: {
          assessmentVersionId: version.id,
          type: question.type,
          statement: question.statement,
          points: question.points,
          position,
          kmkCompetencyId: competency.id,
          kmkSubcompetencyId: subcompetency?.id ?? null,
          feedbackCorrect: question.feedbackCorrect,
          feedbackIncorrect: question.feedbackIncorrect,
          payload: payload as object,
        },
      });
    }
  }

  const counts = {
    usuarios: await prisma.user.count(),
    docentes: await prisma.teacher.count(),
    estudiantes: await prisma.student.count(),
    grupos: await prisma.group.count(),
    evaluaciones: await prisma.assessment.count(),
    preguntas: await prisma.question.count(),
  };

  console.warn(
    `  demo: ${counts.usuarios} usuarios (${counts.docentes} docentes, ${counts.estudiantes} estudiantes) · ` +
      `${counts.grupos} grupos · ${counts.evaluaciones} evaluaciones · ${counts.preguntas} preguntas`,
  );
  console.warn(`  contraseña de las cuentas de demostración: ${DEMO_PASSWORD}`);
}
