import type { PublicContent } from './types';

/** Contenido de la portada y la wiki en español. */
export const es: PublicContent = {
  home: {
    hero: {
      eyebrow: 'Colegio Alemán de Barranquilla',
      title: 'Medienpass',
      lead: 'Evaluar de verdad las competencias digitales, no solo usarlas.',
      body:
        'Casi cualquier clase usa hoy medios digitales. Muy pocas pueden decir qué competencia digital concreta ejercitó un estudiante el martes, ni cómo ha cambiado eso a lo largo del año. Medienpass existe para cerrar esa distancia: cada pregunta que se responde en la plataforma queda asociada a una competencia del marco KMK, y de ahí sale una imagen del avance que se puede mirar por estudiante, por curso y por competencia.',
    },

    why: {
      title: 'Por qué los medios digitales necesitan evaluarse, y no solo usarse',
      lead:
        'Introducir tecnología en el aula es fácil. Saber si está enseñando algo es otra cosa, y sin esa segunda parte lo primero se convierte en decoración.',
      points: [
        {
          tag: 'El problema',
          title: 'Usar no es comprender',
          body:
            'Un estudiante que copia el primer resultado de un buscador ha usado una herramienta digital y no ha ejercido ninguna competencia. La diferencia entre las dos cosas no se ve mirando la pantalla por encima del hombro: hay que preguntar, y hay que preguntar de una forma que distinga repetir de verificar.',
        },
        {
          tag: 'La consecuencia',
          title: 'Lo que no se mide se supone',
          body:
            'Sin datos, cada docente se forma su propia impresión sobre cómo va su grupo en competencias digitales, y esas impresiones no se pueden sumar ni contrastar. El resultado es un colegio que invierte en tecnología y no puede decir qué obtuvo a cambio.',
        },
        {
          tag: 'La propuesta',
          title: 'Una competencia por pregunta',
          body:
            'Aquí ninguna pregunta existe sin declarar qué competencia KMK ejercita. No es burocracia: es lo que convierte un examen en un dato comparable entre materias, entre cursos y entre años, y lo que permite descubrir que el problema de 10.º no es «lo digital» sino, en concreto, evaluar fuentes.',
        },
        {
          tag: 'El límite',
          title: 'Los datos orientan, no deciden',
          body:
            'Un porcentaje dice dónde mirar, no qué hacer. La plataforma no califica lo que un docente debe corregir a mano, no publica nada sin que alguien lo lea, y no convierte a un estudiante en una cifra: cada resultado va acompañado de su desglose por competencia y de la retroalimentación que lo explica.',
        },
      ],
    },

    frameworks: {
      title: 'Tres marcos, un mismo trabajo',
      lead:
        'El colegio se mueve entre tres referencias que suelen presentarse por separado: el marco alemán KMK, los estándares ISTE y la formación del IB. No compiten. Describen la misma competencia desde tres ángulos —qué se sabe hacer, cómo se enseña y qué persona se está formando—, y esta plataforma las trata como tales.',

      kmk: {
        name: 'Marco KMK',
        subtitle: 'Bildung in der digitalen Welt',
        intro:
          'Seis competencias adoptadas por la Kultusministerkonferenz para toda la enseñanza general alemana. Es el marco que Medienpass mide: cada pregunta declara una y las estadísticas se agregan por ellas.',
        items: [
          {
            tag: 'KMK 1',
            title: 'Buscar, procesar y archivar',
            body:
              'Formular la pregunta antes de buscarla, acotar con criterio, juzgar quién firma lo que aparece y conservarlo de modo que se pueda recuperar y citar.',
          },
          {
            tag: 'KMK 2',
            title: 'Comunicar y colaborar',
            body:
              'Trabajar con otros en herramientas compartidas, acordar normas de convivencia en línea y saber intervenir cuando algo se tuerce.',
          },
          {
            tag: 'KMK 3',
            title: 'Producir y presentar',
            body:
              'Pasar del collage a la producción propia, eligiendo el formato según lo que se quiere decir y respetando el derecho de autor.',
          },
          {
            tag: 'KMK 4',
            title: 'Proteger y actuar de forma segura',
            body:
              'Cuidar los datos personales, reconocer el engaño y saber qué hacer con ellos; entender que la seguridad es una práctica y no un ajuste.',
          },
          {
            tag: 'KMK 5',
            title: 'Resolver problemas y actuar',
            body:
              'Elegir la herramienta adecuada, apañárselas cuando falla y entender lo suficiente de cómo funciona para no depender de que alguien lo arregle.',
          },
          {
            tag: 'KMK 6',
            title: 'Analizar y reflexionar sobre los medios',
            body:
              'Ver el medio además del mensaje: quién lo produce, con qué intención, qué deja fuera y cómo eso influye en quien lo consume.',
          },
        ],
        source: {
          label: 'Estrategia de la KMK (PDF)',
          url: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2021/2021_12_09-Lehren-und-Lernen-Digi.pdf',
        },
      },

      isteStudents: {
        name: 'ISTE · Estudiantes',
        subtitle: 'Siete perfiles de aprendizaje',
        intro:
          'Donde la KMK describe competencias, ISTE describe papeles que el estudiante asume. Son útiles para diseñar la tarea: dicen qué debe estar haciendo, no solo qué debe saber.',
        items: [
          {
            tag: '1.1',
            title: 'Empowered Learner',
            body: 'Toma parte activa en fijar y demostrar sus propias metas de aprendizaje.',
          },
          {
            tag: '1.2',
            title: 'Digital Citizen',
            body:
              'Gestiona su identidad digital, actúa de forma segura y ética y respeta la propiedad intelectual.',
          },
          {
            tag: '1.3',
            title: 'Knowledge Constructor',
            body: 'Construye conocimiento a partir de recursos que ha sabido localizar y evaluar.',
          },
          {
            tag: '1.4',
            title: 'Innovative Designer',
            body: 'Diseña soluciones a problemas reales y tolera que el primer intento falle.',
          },
          {
            tag: '1.5',
            title: 'Computational Thinker',
            body: 'Descompone problemas, reconoce patrones y prueba sus hipótesis con datos.',
          },
          {
            tag: '1.6',
            title: 'Creative Communicator',
            body: 'Se expresa eligiendo el medio y el formato según el destinatario.',
          },
          {
            tag: '1.7',
            title: 'Global Collaborator',
            body: 'Amplía su perspectiva trabajando con personas de otros contextos.',
          },
        ],
        source: { label: 'ISTE Standards for Students', url: 'https://iste.org/standards/students' },
      },

      isteEducators: {
        name: 'ISTE · Docentes',
        subtitle: 'Siete papeles del profesional',
        intro:
          'La contraparte del marco anterior. Describe lo que el docente hace para que lo anterior ocurra, y es la referencia de los módulos de capacitación de esta plataforma.',
        items: [
          {
            tag: '2.1',
            title: 'Learner',
            body: 'Sigue formándose: fija metas propias y contrasta su práctica con la de otros.',
          },
          {
            tag: '2.2',
            title: 'Leader',
            body: 'Impulsa una visión compartida del aprendizaje con tecnología en su comunidad.',
          },
          {
            tag: '2.3',
            title: 'Citizen',
            body: 'Modela una ciudadanía digital responsable y la enseña con el ejemplo.',
          },
          {
            tag: '2.4',
            title: 'Collaborator',
            body: 'Dedica tiempo a trabajar con colegas y con estudiantes para mejorar la práctica.',
          },
          {
            tag: '2.5',
            title: 'Designer',
            body: 'Diseña actividades auténticas que reconocen que los estudiantes son distintos.',
          },
          {
            tag: '2.6',
            title: 'Facilitator',
            body: 'Acompaña el aprendizaje con tecnología en lugar de sustituirlo por ella.',
          },
          {
            tag: '2.7',
            title: 'Analyst',
            body:
              'Usa los datos para entender el avance y ajustar la enseñanza. Es el papel al que sirven directamente las estadísticas de Medienpass.',
          },
        ],
        source: { label: 'ISTE Standards for Educators', url: 'https://iste.org/standards/educators' },
      },

      ib: {
        name: 'Perfil de la comunidad de aprendizaje del IB',
        subtitle: 'Diez atributos, cuatro programas',
        intro:
          'El IB no describe competencias digitales, describe qué clase de persona se está formando. Por eso no compite con los otros dos marcos: les da la razón de ser. Una competencia sin el atributo que la sostiene es una destreza sin criterio.',
        items: [
          { tag: 'Indagadores', title: 'Inquirers', body: 'Cultivan la curiosidad y saben investigar por su cuenta.' },
          { tag: 'Informados', title: 'Knowledgeable', body: 'Exploran ideas con significado local y global.' },
          { tag: 'Pensadores', title: 'Thinkers', body: 'Analizan de forma crítica y toman decisiones razonadas y éticas.' },
          { tag: 'Comunicadores', title: 'Communicators', body: 'Se expresan con claridad y escuchan otras perspectivas.' },
          { tag: 'Íntegros', title: 'Principled', body: 'Actúan con honestidad y asumen las consecuencias de sus actos.' },
          { tag: 'De mentalidad abierta', title: 'Open-minded', body: 'Valoran su cultura y se abren a las de los demás.' },
          { tag: 'Solidarios', title: 'Caring', body: 'Muestran empatía y se comprometen con el servicio a otros.' },
          { tag: 'Audaces', title: 'Risk-takers', body: 'Afrontan lo desconocido con criterio y sin miedo a equivocarse.' },
          { tag: 'Equilibrados', title: 'Balanced', body: 'Cuidan el equilibrio entre lo intelectual, lo físico y lo emocional.' },
          { tag: 'Reflexivos', title: 'Reflective', body: 'Evalúan su propio aprendizaje y reconocen sus límites.' },
        ],
        source: { label: 'IB learner profile (PDF)', url: 'https://www.ibo.org/globalassets/new-structure/digital-toolkit/pdfs/learner-profile-2017-en.pdf' },
      },
    },

    crosswalk: {
      title: 'Cómo se cruzan los tres marcos',
      lead:
        'La tabla no pretende que las correspondencias sean exactas. Sirve para ver que, cuando un docente diseña una buena tarea digital, está atendiendo a los tres marcos a la vez aunque solo estuviera pensando en uno.',
      caveat:
        'Las correspondencias son orientativas y las establece el colegio, no los organismos que publican los marcos. Ninguno de los tres se define en función de los otros.',
      columns: {
        kmk: 'Competencia KMK',
        iste: 'ISTE (estudiante / docente)',
        ib: 'Atributo del perfil IB',
        practice: 'A qué se parece en el aula',
      },
      rows: [
        {
          kmk: '1 · Buscar, procesar y archivar',
          iste: 'Knowledge Constructor / Facilitator',
          ib: 'Indagadores, Pensadores',
          practice:
            'Pedir una afirmación polémica y tres fuentes que la sostengan, y averiguar si son independientes o se copian entre sí.',
        },
        {
          kmk: '2 · Comunicar y colaborar',
          iste: 'Global Collaborator / Collaborator',
          ib: 'Comunicadores, De mentalidad abierta',
          practice:
            'Un documento compartido con normas acordadas de antemano, donde el historial de versiones forma parte de lo que se evalúa.',
        },
        {
          kmk: '3 · Producir y presentar',
          iste: 'Creative Communicator / Designer',
          ib: 'Audaces, Comunicadores',
          practice:
            'Grabar un vídeo explicativo de dos minutos citando las fuentes de cada imagen que aparece.',
        },
        {
          kmk: '4 · Proteger y actuar de forma segura',
          iste: 'Digital Citizen / Citizen',
          ib: 'Íntegros, Solidarios',
          practice:
            'Analizar un caso real de suplantación y decidir, paso a paso, qué haría el grupo si le ocurriera a un compañero.',
        },
        {
          kmk: '5 · Resolver problemas y actuar',
          iste: 'Computational Thinker / Analyst',
          ib: 'Pensadores, Audaces',
          practice:
            'Enfrentarse a una herramienta que falla y documentar qué se probó, en qué orden y qué lo resolvió.',
        },
        {
          kmk: '6 · Analizar y reflexionar',
          iste: 'Empowered Learner / Leader',
          ib: 'Reflexivos, Equilibrados',
          practice:
            'Comparar cómo tres medios cuentan el mismo hecho y explicar qué deja fuera cada uno y a quién beneficia.',
        },
      ],
    },

    ibLevels: {
      title: 'En cada nivel del IB',
      lead:
        'Los atributos del perfil son los mismos de los cuatro a los dieciocho años; lo que cambia es qué significa ejercerlos. La competencia digital acompaña ese recorrido en lugar de aparecer de golpe en secundaria.',
      levels: [
        {
          tag: 'PYP',
          title: 'Programa de la Escuela Primaria',
          body:
            'La indagación empieza antes de saber leer bien. Aquí la competencia digital es sobre todo hábito: preguntar de dónde salió una imagen, entender que lo que se publica queda, y empezar a producir en lugar de solo consumir.',
        },
        {
          tag: 'MYP',
          title: 'Programa de los Años Intermedios',
          body:
            'Aparece el criterio. El estudiante ya no solo busca: compara fuentes, reconoce la intención de quien publica y empieza a asumir consecuencias de lo que comparte. Es el tramo donde las seis competencias KMK se pueden evaluar con más claridad.',
        },
        {
          tag: 'DP',
          title: 'Programa del Diploma',
          body:
            'La exigencia se vuelve académica. Citar bien deja de ser una norma escolar y pasa a ser integridad intelectual; la Monografía y Teoría del Conocimiento ponen a prueba justamente lo que miden las competencias 1 y 6.',
        },
        {
          tag: 'CP',
          title: 'Programa de Orientación Profesional',
          body:
            'El destino es un entorno laboral, donde la competencia digital se juzga por lo que se sabe hacer y no por lo que se ha estudiado. Producir, colaborar y resolver problemas pesan más que memorizar.',
        },
      ],
    },

    access: {
      title: 'Entrar a la plataforma',
      lead:
        'El acceso es el mismo para todos —con el correo institucional— y lo que cambia es lo que se encuentra dentro. Si no sabes cuál es tu caso, entra y la plataforma te llevará a donde corresponde.',
      roles: [
        {
          key: 'student',
          title: 'Estudiantes',
          body:
            'Tu correo es tu código de cuatro dígitos seguido de @colegioaleman.edu.co. Si aún no tienes contraseña, la asigna el colegio.',
          bullets: [
            'Ver las evaluaciones que te han asignado y responderlas',
            'Recuperar un intento a medias sin perder nada de lo escrito',
            'Consultar tu nota, el desglose por competencia y la retroalimentación',
          ],
        },
        {
          key: 'teacher',
          title: 'Docentes',
          body:
            'Con tu correo institucional. Puedes entrar con contraseña o, si está habilitado, con la cuenta de Microsoft del colegio.',
          bullets: [
            'Crear evaluaciones, con ayuda de la IA si quieres, y previsualizarlas antes de publicar',
            'Asignarlas a tus grupos y corregir las respuestas abiertas',
            'Ver los resultados por curso y tu propia capacitación KMK',
          ],
        },
        {
          key: 'admin',
          title: 'Administración',
          body:
            'Para quien coordina la plataforma: estructura académica, permisos y contenido formativo.',
          bullets: [
            'Sincronizar la matrícula con Phidias y abrir el año lectivo',
            'Redactar y publicar el material de capacitación docente',
            'Ajustar permisos por rol, la IA y los archivos guardados',
          ],
        },
      ],
    },
  },

  wiki: {
    title: 'Cómo se usa Medienpass',
    lead:
      'Una guía por tareas, no por pantallas: lo que quieres hacer y los pasos para hacerlo. Está escrita para que se pueda leer antes de entrar por primera vez.',
    audiences: {
      all: 'Todos',
      teacher: 'Docentes',
      student: 'Estudiantes',
      admin: 'Administración',
    },
    sections: [
      {
        id: 'acceso',
        title: 'Entrar por primera vez',
        audience: 'all',
        lead:
          'Todo el mundo entra por el mismo sitio. Lo que cambia después es el menú que aparece a la izquierda, que depende de lo que tu cuenta puede hacer.',
        steps: [
          {
            title: 'Usa tu correo institucional',
            body:
              'El de los estudiantes es su código de cuatro dígitos más @colegioaleman.edu.co. El del profesorado es su correo habitual del colegio.',
            tip:
              'Si el sistema dice que las credenciales no son válidas y estás seguro del correo, puede que tu cuenta aún no tenga contraseña asignada. Eso lo resuelve administración, no un cambio de contraseña.',
          },
          {
            title: 'Cambia la contraseña provisional',
            body:
              'Cuando el colegio emite contraseñas, se dictan en voz alta o se imprimen en un listado. La plataforma obliga a cambiarla antes de dejarte hacer nada más, y no es una molestia: esa contraseña ha pasado por manos ajenas.',
          },
          {
            title: 'Elige tu idioma',
            body:
              'Arriba a la derecha. La interfaz está en español, alemán e inglés, y la elección se recuerda. El idioma del contenido —un enunciado, un módulo— lo decide quien lo escribió.',
          },
        ],
        screen: {
          title: 'Pantalla de acceso',
          caption: 'Lo mismo para estudiantes, docentes y administración.',
          regions: [
            { label: 'Correo institucional', note: 'codigo@colegioaleman.edu.co', emphasis: true },
            { label: 'Contraseña', note: 'La provisional caduca en el primer uso' },
            { label: 'Entrar', note: 'Botón principal', emphasis: true },
            { label: 'Acceso con Microsoft', note: 'Si el colegio lo tiene habilitado' },
            { label: 'Idioma', note: 'Español · Deutsch · English' },
          ],
        },
        faq: [
          {
            question: '¿Puedo entrar desde el móvil?',
            answer:
              'Sí. La plataforma está pensada para funcionar en pantalla pequeña, y el runner de evaluación en particular está probado en tableta, que es el formato más habitual en el aula.',
          },
          {
            question: 'Olvidé mi contraseña.',
            answer:
              'Pídesela a administración. No hay recuperación automática por correo a propósito: muchos estudiantes comparten dispositivo, y un enlace de restablecimiento en una bandeja compartida es una cuenta compartida.',
          },
        ],
      },

      {
        id: 'estudiante-evaluacion',
        title: 'Responder una evaluación',
        audience: 'student',
        lead:
          'Todo lo que escribes se guarda solo, mientras escribes. No hay que pulsar «guardar» en ningún momento.',
        steps: [
          {
            title: 'Abre «Mis evaluaciones»',
            body:
              'Ahí están las que te han asignado y las que ya entregaste. Cada una indica cuántos intentos te quedan y hasta cuándo está abierta.',
          },
          {
            title: 'Responde en el orden que quieras',
            body:
              'Puedes ir y volver entre preguntas con el mapa de la parte de abajo. Las respondidas se marcan; las que faltan, también.',
            tip:
              'Si se te cierra el navegador o se va la conexión, vuelve a entrar y sigue donde estabas. El intento te espera con todo lo que habías escrito.',
          },
          {
            title: 'Adjunta evidencia cuando te la pidan',
            body:
              'Algunas preguntas admiten fotos, documentos o audio. Si la evidencia es obligatoria, la pregunta lo dice y no podrás finalizar hasta adjuntarla.',
            tip:
              'Sube el archivo en cuanto lo tengas, no al final. Si dejas cinco subidas para el último minuto, competirán entre sí por la conexión del colegio.',
          },
          {
            title: 'Finaliza cuando estés seguro',
            body:
              'Al finalizar, la plataforma vacía lo que quedara por guardar y cierra el intento. No se puede deshacer.',
          },
        ],
        screen: {
          title: 'Resolviendo una evaluación',
          caption: 'El temporizador lo lleva el servidor: recargar no lo reinicia.',
          regions: [
            { label: 'Barra superior', note: 'Título, tiempo restante y estado de guardado' },
            { label: 'Enunciado', note: 'Con formato, imágenes y la competencia KMK que mide' },
            { label: 'Tu respuesta', note: 'Se guarda sola al dejar de escribir', emphasis: true },
            { label: 'Evidencia', note: 'Solo si la pregunta la admite' },
            { label: 'Mapa de preguntas', note: 'Respondidas, pendientes y la actual', emphasis: true },
          ],
        },
        faq: [
          {
            question: '¿Qué pasa si se acaba el tiempo mientras escribo?',
            answer:
              'El intento se cierra con lo que hubiera guardado. El tiempo lo controla el servidor, así que el reloj de tu pantalla es solo informativo: recargar la página no te da más minutos.',
          },
          {
            question: 'Vi mi nota pero no entiendo de dónde sale.',
            answer:
              'En la pantalla de resultado, debajo de la nota, está el desglose por competencia KMK y la retroalimentación de cada pregunta. Si la evaluación tenía respuestas abiertas, la nota puede cambiar cuando tu docente termine de corregirlas.',
          },
        ],
      },

      {
        id: 'estudiante-resultados',
        title: 'Entender tu resultado',
        audience: 'student',
        lead:
          'La nota sigue la escala alemana: 1,0 es el mejor resultado y 6,0 el peor. Las estrellas acompañan a la cifra, no la sustituyen.',
        steps: [
          {
            title: 'Mira primero el desglose, no la nota',
            body:
              'El porcentaje total dice cómo te fue; el desglose por competencia dice en qué. No es lo mismo fallar en «buscar y evaluar fuentes» que en «producir y presentar», y estudiar más de lo mismo no arregla ninguno de los dos.',
          },
          {
            title: 'Cuidado con las estrellas',
            body:
              'Cinco estrellas significan un 1,0, la mejor nota. Es al revés de como funcionan en una tienda, y por eso la plataforma nunca las muestra solas: siempre van con el número y con la palabra.',
          },
          {
            title: 'Lee la retroalimentación',
            body:
              'Cada pregunta trae una explicación de por qué la respuesta correcta lo es. Es la parte que de verdad enseña algo; la nota solo resume.',
          },
        ],
      },

      {
        id: 'docente-crear',
        title: 'Crear y publicar una evaluación',
        audience: 'teacher',
        lead:
          'Una evaluación tiene versiones. Mientras es borrador se puede cambiar todo; una vez publicada queda congelada, y eso es lo que hace que un resultado de marzo siga significando lo mismo en noviembre.',
        steps: [
          {
            title: 'Crea la evaluación',
            body:
              'Título, materia, grado e idioma. Se crea con su primera versión en borrador, lista para añadirle preguntas.',
          },
          {
            title: 'Añade preguntas',
            body:
              'Trece tipos disponibles, desde opción única hasta ordenar, relacionar o marcar zonas de una imagen. Cada pregunta declara obligatoriamente qué competencia KMK ejercita.',
            tip:
              'Esa declaración es lo que hace posible todo lo demás. Una pregunta etiquetada a la ligera contamina las estadísticas del curso entero, y nadie lo va a notar hasta que las cifras dejen de tener sentido.',
          },
          {
            title: 'Decide si admite evidencia',
            body:
              'Por pregunta, puedes permitir que el estudiante adjunte archivos, y exigirlo para poder finalizar. Está apagado por defecto: pedir un archivo que no hace falta es fricción para el estudiante y almacenamiento que alguien tendrá que borrar.',
          },
          {
            title: 'Previsualiza antes de publicar',
            body:
              'Desde el botón «Previsualizar» ves la evaluación exactamente como la verá tu clase, y puedes responderla para probarla sin que se guarde nada. Con el interruptor «Ver las respuestas» compruebas además que la solución marcada es la correcta.',
            tip:
              'Este paso es imprescindible si usaste la IA. Una pregunta generada puede ser impecable de forma y tener marcada la opción equivocada; ninguna validación automática detecta eso, y una persona leyéndola sí.',
          },
          {
            title: 'Publica y asigna',
            body:
              'Al publicar, la versión queda inmutable. Después la asignas a uno de tus grupos, con las fechas y el número de intentos.',
            tip:
              'Solo puedes asignar a grupos que diriges. Si el desplegable sale vacío, no es un fallo: significa que no figuras como director de ninguno, y eso lo arregla administración.',
          },
          {
            title: 'Corrige lo que la máquina no puede',
            body:
              'Las respuestas abiertas quedan pendientes de revisión. Hasta que las corriges, la nota del estudiante refleja solo la parte automática.',
          },
        ],
        screen: {
          title: 'Detalle de una evaluación',
          caption: 'En borrador aparecen las acciones de edición; publicada, las de uso.',
          regions: [
            { label: 'Cabecera', note: 'Título, estado, versión, preguntas y puntos' },
            { label: 'Acciones', note: 'Previsualizar · Editar · Publicar · Asignar · Resultados', emphasis: true },
            { label: 'Listado de preguntas', note: 'Con su competencia KMK y sus puntos' },
            { label: 'Editor de pregunta', note: 'Enunciado con formato, imagen y evidencia', emphasis: true },
            { label: 'Historial de versiones', note: 'Qué se publicó y cuándo' },
          ],
        },
        faq: [
          {
            question: 'Me equivoqué en una pregunta ya publicada.',
            answer:
              'Crea una versión nueva: copia las preguntas y te deja corregirlas. Los intentos ya realizados siguen apuntando a la versión con la que se respondieron, así que ningún resultado emitido cambia.',
          },
          {
            question: '¿Puedo borrar una evaluación con notas?',
            answer:
              'Solo un administrador, y escribiendo el título para confirmar. Antes de borrar, la plataforma dice cuántos intentos y de cuántos estudiantes se van a destruir. No hay vuelta atrás.',
          },
        ],
      },

      {
        id: 'docente-ia',
        title: 'Generar preguntas con IA',
        audience: 'teacher',
        lead:
          'La IA propone; tú decides. Todo lo que genera nace como borrador y no llega a ningún estudiante hasta que lo lees y lo publicas.',
        steps: [
          {
            title: 'Describe el tema',
            body: 'Una frase corta. «El ciclo del agua», «Verificación de fuentes en internet».',
          },
          {
            title: 'Escribe el contexto, que es lo que marca la diferencia',
            body:
              'Qué se vio en clase, con qué herramientas trabajan, qué vocabulario usar y qué evitar. Es la diferencia entre una evaluación genérica y una que encaja con tu grupo.',
            tip:
              'Un ejemplo real: «Sexto grado. Ya vimos evaporación y condensación con un experimento de vaso y hielo. Todavía no hemos visto infiltración. Evita ejemplos con nieve: aquí no nieva». El modelo usó el experimento del vaso en una pregunta y no mencionó la nieve.',
          },
          {
            title: 'Elige competencias y tipos',
            body:
              'Al menos una competencia KMK. Los tipos ofrecidos son solo los que el modelo genera bien: no se ofrecen los que exigen coordenadas sobre una imagen que nadie le ha enseñado.',
          },
          {
            title: 'Revisa el borrador',
            body:
              'Abre la previsualización con las respuestas visibles y léelas. Una pregunta sin respuesta correcta marcada aparece señalada en rojo.',
          },
        ],
        faq: [
          {
            question: 'Generé algo y salieron preguntas sin relación con el tema.',
            answer:
              'Significa que la plataforma está en modo simulado, sin clave de API. En ese modo devuelve relleno con la forma correcta pero sin contenido real. El formulario lo avisa arriba antes de generar.',
          },
          {
            question: '¿Cuánto tarda?',
            answer:
              'Unos veinticinco segundos para cinco preguntas y hasta minuto y medio para treinta. No cierres la página mientras trabaja.',
          },
        ],
      },

      {
        id: 'docente-resultados',
        title: 'Leer los resultados de un grupo',
        audience: 'teacher',
        lead:
          'Hay dos pantallas y responden a preguntas distintas: «cómo va el curso en general» y «cómo fue esta evaluación en concreto».',
        steps: [
          {
            title: 'Mira primero cuántos empezaron',
            body:
              'En los resultados por grupo, la columna «sin empezar» va antes que la media. Un 40 % de media con la mitad del curso sin abrir la evaluación no dice nada sobre la clase.',
          },
          {
            title: 'Compara la forma, no solo el promedio',
            body:
              'La distribución por banda muestra si el grupo es homogéneo o está partido en dos. Dos cursos con la misma media pueden necesitar clases distintas.',
          },
          {
            title: 'Revisa las preguntas más falladas',
            body:
              'Están ordenadas por la dificultad observada, no por la que declaraste al escribirlas. Cuando no coinciden, el problema suele estar en el enunciado y no en el grupo.',
          },
          {
            title: 'Usa el radar KMK para decidir qué reforzar',
            body:
              'Las competencias no medidas aparecen como cero y no desaparecen del gráfico, que es lo que permite notar que llevas todo el año sin evaluar «analizar y reflexionar».',
          },
        ],
      },

      {
        id: 'docente-capacitacion',
        title: 'Tu propia capacitación KMK',
        audience: 'teacher',
        lead:
          'Seis módulos, uno por competencia, con material y una evaluación al final. La evaluación usa el mismo motor que la de tus estudiantes, así que vives exactamente lo que ellos van a vivir.',
        steps: [
          {
            title: 'Recorre el material',
            body:
              'Cada bloque que abres cuenta como visto. Hay textos, actividades y recursos externos verificados: la estrategia de la KMK, Medienkompetenzrahmen NRW, klicksafe, Internet-ABC, INTEF y Common Sense.',
          },
          {
            title: 'Haz la evaluación del módulo',
            body:
              'Tienes cinco intentos. El umbral de aprobación del profesorado es del 80 %, más exigente que el 70 % de los estudiantes, y se dice antes de empezar.',
          },
          {
            title: 'Certifícate',
            body:
              'Recorrer el material no certifica: certifica superar la evaluación. Son cosas distintas a propósito.',
          },
        ],
      },

      {
        id: 'admin-contenido',
        title: 'Redactar material de capacitación',
        audience: 'admin',
        lead:
          'El material se escribe por bloques dentro de cada módulo. Nada se ve hasta publicarlo.',
        steps: [
          {
            title: 'Crea el módulo',
            body:
              'Código corto y estable, competencia KMK, título y descripción. Nace en borrador.',
          },
          {
            title: 'Añade bloques',
            body:
              'Texto, vídeo, documento, enlace o actividad. Cada uno con su título, su cuerpo con formato y, si hace falta, adjuntos.',
            tip:
              'Varios bloques cortos funcionan mejor que uno largo: el docente los recorre desplegándolos, y el avance se mide por cuántos abrió. Un bloque de diez páginas convierte ese avance en un interruptor.',
          },
          {
            title: 'Distingue imagen de adjunto',
            body:
              'La imagen que ilustra un párrafo se inserta dentro del texto, desde la barra del editor. El PDF que se descarga va como adjunto. Son cosas distintas y se comportan distinto.',
          },
          {
            title: 'Publica',
            body:
              'Un módulo sin material no se puede publicar. Después puedes despublicarlo o archivarlo; archivar conserva el avance de quien ya lo cursó.',
          },
        ],
        screen: {
          title: 'Editor de módulo',
          caption: 'Los bloques se reordenan con las flechas y se despliegan para editarlos.',
          regions: [
            { label: 'Cabecera', note: 'Estado, código y acciones de publicación', emphasis: true },
            { label: 'Datos del módulo', note: 'Título y descripción, en los tres idiomas' },
            { label: 'Bloques', note: 'Plegados; se abren uno a uno para editar', emphasis: true },
            { label: 'Editor del bloque', note: 'Texto con formato, imágenes, enlace y adjuntos' },
            { label: 'Evaluación vinculada', note: 'La que certifica el módulo' },
          ],
        },
      },

      {
        id: 'admin-plataforma',
        title: 'Administrar la plataforma',
        audience: 'admin',
        lead:
          'Cuatro zonas: permisos por rol, ajustes, año lectivo y archivos. Son operaciones poco frecuentes y de mucho alcance, y la interfaz está pensada para hacerlas con conocimiento de causa, no deprisa.',
        steps: [
          {
            title: 'Permisos por rol',
            body:
              'Qué puede hacer cada rol, editable sin desplegar. El rol de administrador aparece bloqueado: si se le pudieran quitar permisos, bastaría un descuido para dejar la instalación sin nadie capaz de devolvérselos.',
          },
          {
            title: 'Sincronizar con Phidias',
            body:
              'Trae la matrícula real. El correo de cada estudiante se deriva de su código; el correo personal que a veces trae Phidias es el contacto de la familia y no se usa como identidad.',
          },
          {
            title: 'Abrir el año lectivo',
            body:
              'Crea el año nuevo y replica los grupos vacíos; la matrícula entra después por Phidias. El año anterior queda intacto con todas sus notas.',
            tip:
              'La opción de borrar las evidencias del año que se cierra está apagada por defecto. El año anterior conserva sus notas, y una nota puesta sobre una evidencia que ya no existe es una nota que nadie puede volver a justificar.',
          },
          {
            title: 'Archivos guardados',
            body:
              'Qué hay, cuánto ocupa y por año. Para borrar: elegir alcance, simular, revisar y confirmar. No hay copia de lo que se elimina.',
          },
        ],
      },

      {
        id: 'recomendaciones',
        title: 'Recomendaciones de uso',
        audience: 'all',
        lead:
          'Cosas que no son obligatorias pero que evitan la mayoría de los problemas que hemos visto.',
        steps: [
          {
            title: 'Una competencia por pregunta, de verdad',
            body:
              'Si al etiquetar dudas entre dos competencias, probablemente la pregunta está midiendo dos cosas a la vez. Divídela. Una pregunta que mide dos cosas no permite saber cuál falló.',
          },
          {
            title: 'Evalúa las seis competencias a lo largo del año',
            body:
              'Es fácil acabar midiendo solo «buscar» y «producir», que son las que salen solas. El radar KMK muestra los ceros precisamente para que se noten.',
          },
          {
            title: 'La retroalimentación es la parte que enseña',
            body:
              '«¡Bien hecho!» no aporta nada. Explicar por qué la opción correcta lo es, y hacia dónde mirar si se falló, convierte una evaluación en una clase.',
          },
          {
            title: 'Prueba en tableta antes de un examen con tableta',
            body:
              'Diez minutos previsualizando en el mismo dispositivo que usará la clase evitan la mayoría de las sorpresas del día del examen.',
          },
          {
            title: 'No pidas evidencia por si acaso',
            body:
              'Cada archivo que se sube es espacio que alguien tendrá que revisar y borrar algún día, y son trabajos de menores de edad. Pídela cuando la vayas a mirar.',
          },
        ],
      },
    ],
  },
};
