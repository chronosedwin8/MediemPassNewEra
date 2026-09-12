import type { ZodIssue } from 'zod';
import { i18n } from './i18n';

/**
 * Traduce un problema de validación al idioma del usuario.
 *
 * Los esquemas del paquete compartido se validan también en el navegador para
 * que el docente vea el fallo mientras edita. El mensaje que trae Zod por
 * defecto está en inglés —«String must contain at least 1 character(s)»— y
 * acababa impreso tal cual debajo de un formulario por lo demás en español.
 *
 * Los mensajes propios sí se respetan: cuando un esquema define su texto con
 * `.refine()`, está escrito a propósito y dice algo que ningún mapa genérico
 * puede decir («el mínimo de palabras no puede superar al máximo»).
 */

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Los dos límites, en una tabla por tipo de dato.
 *
 * Como tabla y no como cadena de condicionales porque es exactamente eso: una
 * correspondencia entre la clase de valor y cómo se le habla a quien escribe.
 * Un mínimo en un texto no se dice igual que un mínimo en una lista.
 */
const TOO_SMALL: Record<string, (t: Translate, min: number) => string> = {
  array: (t, min) => t('validation.minItems', { min }),
  number: (t, min) => t('validation.min', { min }),
  // Un mínimo de uno en un texto es «esto no puede quedar vacío», que se
  // entiende mucho mejor que «debe tener al menos 1 carácter».
  string: (t, min) => (min <= 1 ? t('validation.required') : t('validation.minLength', { min })),
};

const TOO_BIG: Record<string, (t: Translate, max: number) => string> = {
  array: (t, max) => t('validation.maxItems', { max }),
  number: (t, max) => t('validation.max', { max }),
  string: (t, max) => t('validation.maxLength', { max }),
};

export function translateIssue(issue: ZodIssue): string {
  const t = i18n.global.t as unknown as Translate;

  switch (issue.code) {
    // Mensaje propio del esquema: ya está redactado por alguien.
    case 'custom':
      return issue.message;

    case 'too_small':
      return (TOO_SMALL[issue.type] ?? TOO_SMALL['string']!)(t, Number(issue.minimum));

    case 'too_big':
      return (TOO_BIG[issue.type] ?? TOO_BIG['string']!)(t, Number(issue.maximum));

    case 'invalid_type':
      return issue.received === 'undefined'
        ? t('validation.required')
        : t('validation.invalidType');

    case 'invalid_string':
      return issue.validation === 'email' ? t('validation.email') : t('validation.invalidType');

    default:
      return t('validation.generic');
  }
}
