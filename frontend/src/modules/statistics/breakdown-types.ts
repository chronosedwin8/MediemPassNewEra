import type { LocalizedText } from '@medienpass/shared';

/**
 * Forma del desglose de competencias.
 *
 * Vive fuera del componente porque `<script setup>` no admite exportaciones, y
 * tanto la tabla como la pantalla que la contiene necesitan estos tipos: la
 * segunda recibe la fila pulsada en un evento.
 */

export type Dimension = 'subject' | 'group' | 'student';

export interface BreakdownCell {
  competencyId: string;
  percentage: number;
  answerCount: number;
  correctRate: number;
  level: string;
}

export interface BreakdownRow {
  id: string;
  code: string | null;
  /** Localizado en materias; una cadena ya compuesta en grupos y personas. */
  name: LocalizedText | string;
  /** El área de la materia, el curso del grupo, el grupo del estudiante. */
  context: string | null;
  answerCount: number;
  percentage: number;
  level: string;
  /** Solo las competencias medidas: la ausencia es dato, no un cero. */
  cells: BreakdownCell[];
}

export interface Breakdown {
  dimension: Dimension;
  competencies: Array<{ id: string; code: string; name: LocalizedText; color: string }>;
  rows: BreakdownRow[];
  coverage: { measured: number; total: number };
  totalAnswers: number;
  truncated: boolean;
}
