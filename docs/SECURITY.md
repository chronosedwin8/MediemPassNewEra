# SECURITY.md

Modelo de seguridad de Medienpass: cómo se identifica a las personas, cómo se decide qué pueden hacer y qué datos se guardan.

---

## 1. Los dos caminos de acceso

La plataforma admite **dos formas de demostrar la misma identidad**. No son dos cuentas ni dos tipos de usuario: la persona es un único `User` y ambas vías llevan a ella.

```
                      ┌──────────────────────────┐
  Cuenta del colegio  │                          │
  (Microsoft Entra ID)│                          │
  ───────────────────▶│                          │
                      │          User            │──▶ roles y permisos
  Correo + contraseña │  (una sola identidad)    │
  ───────────────────▶│                          │
                      └──────────────────────────┘
```

El vínculo con el proveedor federado vive en `user_identities`, con `(provider, provider_user_id)` único. En Entra ID ese identificador es el `oid`, que **no cambia** aunque la persona cambie de correo o de apellido.

### Por qué las dos y no solo una

De los 1.177 estudiantes matriculados, **94 no pueden usar SSO**: 20 no tienen correo alguno y el resto usa cuentas personales de gmail, hotmail o yahoo. Un acceso exclusivamente federado dejaría fuera al 7,5 % del alumnado. Al revés, renunciar al SSO obligaría a repartir y gestionar mil doscientas contraseñas que la institución ya gestiona en su directorio.

También importa el caso operativo: si el proveedor de identidad falla o caduca el secreto OAuth, con solo SSO nadie —tampoco administración— podría entrar a arreglarlo.

### Identificador de acceso

El campo de acceso admite **el correo o el nombre de usuario**, sin distinguir mayúsculas ni espacios sobrantes. Para la mayoría el identificador natural es el correo institucional; quien no tiene correo entra con su nombre de usuario.

### Qué hace el SSO y qué no

| Hace                                              | No hace                      |
| ------------------------------------------------- | ---------------------------- |
| Reconoce a quien ya existe en la plataforma       | **Crear cuentas**            |
| Vincula la identidad federada en el primer acceso | Conceder roles               |
| Activa una cuenta pendiente de activación         | Saltarse el censo de Phidias |

El SSO no da de alta a nadie. El censo de estudiantes viene de Phidias y el de docentes lo gestiona administración; permitir que cualquiera con cuenta en el tenant se registrara solo por iniciar sesión vaciaría de sentido ese control. Sin correspondencia se responde `SSO_ACCOUNT_NOT_LINKED` y se registra el intento.

Sí se acepta que entrar por SSO **active** una cuenta que estaba pendiente: la persona acaba de demostrar su identidad ante el proveedor del colegio, que es una prueba al menos tan buena como una contraseña enviada por correo.

### El flujo OIDC

```
Navegador ──▶ GET /api/auth/sso/entra/start
                  ├── genera state, nonce y verificador PKCE
                  ├── los guarda en una cookie firmada de 10 minutos
                  └── redirige al proveedor
          ◀── el usuario se autentica en Microsoft
Navegador ──▶ GET /api/auth/sso/entra/callback?code=…&state=…
                  ├── comprueba el state contra la cookie
                  ├── canjea el código con el verificador PKCE
                  ├── verifica la firma del id_token contra el JWKS del tenant
                  ├── comprueba emisor, audiencia y nonce
                  ├── comprueba el dominio del correo
                  ├── resuelve la persona y abre sesión
                  └── redirige a la aplicación
```

Detalles que no son adorno:

- **PKCE (S256)**: sin el verificador original, un código interceptado no se puede canjear.
- **`state`**: ata la respuesta a la petición que la originó. Es lo que impide que alguien induzca a un usuario a completar un flujo que no empezó él.
- **`nonce`**: ata el `id_token` a esa misma petición, de modo que un token válido obtenido en otro contexto no sirva aquí.
- **La cookie del flujo es `SameSite=Lax`**, no `Strict`: el proveedor devuelve al usuario mediante una navegación desde otro sitio, y con `Strict` la cookie nunca llegaría de vuelta.
- **El retorno no lleva ningún token en la URL.** Fija la cookie de refresco y redirige; la aplicación la canjea al arrancar. Un token en la barra de direcciones acaba en el historial, en los registros del servidor y en la cabecera `Referer` de la primera imagen que cargue la página.

## 2. Credenciales de estudiantes

Un estudiante recién sincronizado nace **sin contraseña** y en estado `PENDING_ACTIVATION`. Puede entrar por SSO desde el primer momento; para entrar con contraseña, alguien tiene que emitírsela.

Hay tres momentos para hacerlo:

| Cuándo               | Cómo                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| Al sincronizar       | `POST /api/integrations/phidias/sync/students` con `initialPassword` |
| Al crear a mano      | `POST /api/students` con `password`                                  |
| En cualquier momento | `POST /api/students/credentials`                                     |

La emisión masiva acepta un grupo completo, una lista de estudiantes o «solo quienes aún no pueden entrar», que es el caso justo después de sincronizar. Se puede indicar una contraseña compartida para toda la entrega o dejar que se genere **una distinta por persona**.

Las contraseñas generadas evitan los caracteres que se confunden al dictarlas (l/I/1, O/0): se van a leer en voz alta en un aula.

**Se devuelven una sola vez.** No se almacenan en claro en ningún sitio ni aparecen en la auditoría; si se pierden, hay que volver a emitirlas. La cuenta pasa a activa y se marca para exigir el cambio en el primer acceso: una contraseña que se dicta en clase o se imprime en un listado ha pasado por manos ajenas y no debe seguir siendo la definitiva.

Cambiar la contraseña **revoca todas las sesiones abiertas**. Es intencionado: si el motivo del cambio fuera una sospecha, dejar sesiones vivas lo haría inútil.

## 3. Sesiones

| Pieza             | Duración              | Dónde vive                                                   |
| ----------------- | --------------------- | ------------------------------------------------------------ |
| Token de acceso   | 15 minutos            | Cabecera `Authorization`; en el cliente, **en memoria**      |
| Token de refresco | 30 días, rotativo     | Cookie `httpOnly`, `SameSite=Strict`, `Secure` en producción |
| Token CSRF        | Igual que el refresco | Cookie legible + cabecera `x-csrf-token`                     |

El token de acceso **no se guarda en `localStorage`**: si un script ajeno llegara a ejecutarse en la página, no podría leerlo. La sesión sobrevive a las recargas gracias a la cookie de refresco, que JavaScript no puede leer.

Del refresco se guarda **solo su hash**: si la base de datos se filtrase, los tokens almacenados no serían utilizables.

### Detección de robo

Cada refresco pertenece a una `family`. Al rotarlo, el anterior queda revocado. Si llega un refresco ya rotado, se asume robo y **se revoca la familia completa**: el atacante y la víctima quedan fuera, y la víctima vuelve a entrar con sus credenciales.

En el cliente, varias peticiones que caducan a la vez comparten una única renovación. Sin eso, cargar un panel con seis llamadas simultáneas dispararía seis rotaciones y el propio mecanismo antirrobo las interpretaría como reutilización.

## 4. Contraseñas

- **Argon2id** con 19 MiB de memoria, dos iteraciones y paralelismo 1 (recomendación de OWASP). Resiste tanto ataques por canal lateral como por hardware dedicado, que es el escenario de una base filtrada.
- Política: mínimo 10 caracteres con mayúscula, minúscula y número. Se aplica en un único sitio y rige igual en el alta, el cambio y el restablecimiento.
- **Bloqueo tras cinco intentos fallidos** durante 15 minutos.
- Contraseña incorrecta y usuario inexistente devuelven **el mismo código**, y en ambos casos se ejecuta un hasheo: distinguirlos por respuesta o por tiempo permitiría enumerar qué cuentas existen.

## 5. Autorización

Dos preguntas distintas, respondidas en sitios distintos:

| Pregunta           | Dónde se responde                                 |
| ------------------ | ------------------------------------------------- |
| ¿Puede hacer esto? | Middleware, con el permiso (`assessment:publish`) |
| ¿Sobre qué filas?  | Servicio, con la guarda de propiedad o de alcance |

Confundirlas produce el error clásico de dar por segura la autorización porque «el middleware ya lo comprobó», cuando el middleware solo sabe que el usuario puede editar _alguna_ evaluación, no _esa_.

El catálogo de 54 permisos vive en `packages/shared` y lo consumen tanto el servidor —que los exige— como la interfaz —que decide qué muestra—. Ocultar un botón es cortesía; impedir la acción es cosa del backend, que vuelve a comprobarlo todo en cada petición.

## 6. Datos personales

La plataforma aplica **minimización por diseño**.

El objeto de estudiante que devuelve Phidias trae más de sesenta campos, entre ellos documento de identidad, dirección, teléfono, fecha de nacimiento, grupo sanguíneo y un campo `password`. El esquema de la plataforma declara **ocho**:

```
id externo · nombre · apellidos · usuario · correo · código · idioma · estado de matrícula
```

Lo que no se declara no se lee, y lo que no se lee no puede filtrarse por descuido a un registro ni a una respuesta.

El registrador aplica además una lista de redacción sobre esos mismos nombres de campo —`document`, `address`, `phone`, `birthday`, `password`, `token`, `apiKey`— por si alguna vez alguien los pasa por error. La auditoría hace lo mismo con sus metadatos.

## 7. Transporte y cabeceras

- **Helmet** con política de seguridad de contenido restrictiva.
- **CORS con lista blanca explícita**. Nunca `*` junto a credenciales: sería permitir que cualquier sitio hiciera peticiones autenticadas en nombre del usuario.
- **Límite de peticiones** en tres niveles: general, estricto en autenticación (10 por 15 minutos) y propio para la generación con IA, que protege el presupuesto además de la CPU.
- **Validación con Zod** de cuerpo, parámetros y consulta antes de que nada llegue a un controlador.
- El servidor no anuncia su tecnología (`x-powered-by` desactivado).

## 8. Secretos

Viven exclusivamente en variables de entorno. `.env` está en `.gitignore` y `.env.example` lleva valores ficticios.

El **token de Phidias** merece mención aparte: no sale del backend. No se registra, no se devuelve en ninguna respuesta —ni siquiera enmascarado—, no aparece en mensajes de error y no atraviesa proxies de terceros.

> **Antecedente.** El prototipo anterior incrustaba ese token en JavaScript de navegador y lo reenviaba a través de `corsproxy.io` y `api.allorigins.win` cuando el navegador bloqueaba CORS. Esos proxies públicos vieron la cabecera `Authorization` íntegra, y el token quedó además en los bundles desplegados. **Debe considerarse comprometido y conviene solicitar su rotación.** La arquitectura actual elimina la causa: el navegador nunca habla con Phidias.

## 9. Auditoría

Se registran los accesos —correctos y fallidos, con el motivo—, las acciones administrativas, la publicación y asignación de evaluaciones, los cambios de configuración y de escala, y las sincronizaciones.

Cada entrada lleva usuario, acción, entidad, IP, agente y metadatos depurados. La escritura de auditoría **nunca hace fallar la operación auditada**: perder una entrada es malo, pero impedir que un docente publique una evaluación por ello es peor.

## 10. Configuración de SSO

```bash
SSO_ENABLED=true
ENTRA_TENANT_ID=…      # del registro de aplicación en el tenant del colegio
ENTRA_CLIENT_ID=…
ENTRA_CLIENT_SECRET=…
ENTRA_REDIRECT_URI=https://…/api/auth/sso/entra/callback
SSO_ALLOWED_DOMAINS=colegioaleman.edu.co
```

En el registro de aplicación de Entra ID hay que declarar como _redirect URI_ exactamente el valor de `ENTRA_REDIRECT_URI`, con tipo «Web», y conceder los permisos delegados `openid`, `profile` y `email`.

Con `SSO_ENABLED=false` la pantalla de acceso no muestra el botón y solo se ofrece el acceso con credenciales. El arranque falla si se activa el SSO sin las credenciales del tenant: es preferible descubrirlo al desplegar que en pleno inicio de sesión.
