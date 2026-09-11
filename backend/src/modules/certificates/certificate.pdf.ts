import PDFDocument from 'pdfkit';
import type { Language } from '@medienpass/shared';
import type { CertificateData } from './certificate.service.js';

/**
 * El diploma, dibujado.
 *
 * Se genera en el servidor y no en el navegador por dos motivos. El primero es
 * que el documento debe decir lo mismo siempre: si lo compusiera el cliente,
 * el contenido dependería de lo que ese cliente tuviera cargado. El segundo es
 * que así no hay forma de fabricar un diploma sin pasar por las reglas de
 * `certificate.service`, que son las que deciden si hay algo que certificar.
 *
 * No se guarda en S3. Se compone al vuelo cada vez a partir del intento, que
 * es la fuente de verdad: un PDF almacenado sería una copia que puede quedarse
 * obsoleta si la nota cambia tras una reclamación.
 */

/** Los textos del documento. No pasan por i18n del frontend: se imprimen aquí. */
const TEXT: Record<Language, Record<string, string>> = {
  es: {
    school: 'Colegio Alemán de Barranquilla',
    platform: 'Medienpass · Competencias digitales KMK',
    title: 'Diploma de competencias digitales',
    certifies: 'Se certifica que',
    demonstrated: 'ha demostrado las siguientes competencias del marco KMK',
    inAssessment: 'en la evaluación',
    subject: 'Materia',
    result: 'Resultado',
    grade: 'Nota',
    date: 'Fecha de la evaluación',
    issued: 'Emitido el',
    serial: 'Referencia',
    notAchieved: 'Otras {count} competencias se evaluaron sin alcanzar el nivel requerido.',
    footer:
      'Este documento acredita el resultado de una evaluación concreta dentro de la plataforma Medienpass. La referencia permite localizar el intento que lo originó.',
    levelHint: 'Se certifica una competencia a partir del 70 % en las preguntas que la miden.',
  },
  de: {
    school: 'Deutsche Schule Barranquilla',
    platform: 'Medienpass · Digitale Kompetenzen (KMK)',
    title: 'Zeugnis über digitale Kompetenzen',
    certifies: 'Hiermit wird bescheinigt, dass',
    demonstrated: 'die folgenden Kompetenzen des KMK-Rahmens nachgewiesen hat',
    inAssessment: 'in der Prüfung',
    subject: 'Fach',
    result: 'Ergebnis',
    grade: 'Note',
    date: 'Datum der Prüfung',
    issued: 'Ausgestellt am',
    serial: 'Referenz',
    notAchieved: 'Weitere {count} Kompetenzen wurden geprüft, ohne das Niveau zu erreichen.',
    footer:
      'Dieses Dokument belegt das Ergebnis einer einzelnen Prüfung in der Plattform Medienpass. Über die Referenz lässt sich der zugrunde liegende Versuch auffinden.',
    levelHint: 'Eine Kompetenz gilt ab 70 % in den sie messenden Fragen als nachgewiesen.',
  },
  en: {
    school: 'German School of Barranquilla',
    platform: 'Medienpass · KMK digital competences',
    title: 'Digital competence certificate',
    certifies: 'This certifies that',
    demonstrated: 'has demonstrated the following competences of the KMK framework',
    inAssessment: 'in the assessment',
    subject: 'Subject',
    result: 'Result',
    grade: 'Grade',
    date: 'Assessment date',
    issued: 'Issued on',
    serial: 'Reference',
    notAchieved: 'Another {count} competences were assessed without reaching the required level.',
    footer:
      'This document records the result of one assessment within the Medienpass platform. The reference allows the underlying attempt to be located.',
    levelHint: 'A competence is certified from 70% on the questions that measure it.',
  },
};

const INK = '#1f2937';
const MUTED = '#6b7280';
const BRAND = '#1d4ed8';
const RULE = '#d1d5db';

/** Formato de fecha propio de cada idioma. */
function formatDate(date: Date, language: Language): string {
  const locale = language === 'es' ? 'es-CO' : language === 'de' ? 'de-DE' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

/** Cabecera y marco. El borde encuadra la página y da aire al contenido. */
function drawFrame(doc: PDFKit.PDFDocument, text: Record<string, string>): void {
  doc
    .lineWidth(2)
    .strokeColor(BRAND)
    .rect(28, 28, doc.page.width - 56, doc.page.height - 56)
    .stroke();

  doc
    .lineWidth(0.5)
    .strokeColor(RULE)
    .rect(38, 38, doc.page.width - 76, doc.page.height - 76)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(BRAND)
    .text(text['school']!, 0, 66, { align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(text['platform']!, 0, 84, { align: 'center' });
}

/** La lista de competencias logradas, que es el contenido real del diploma. */
function drawCompetencies(
  doc: PDFKit.PDFDocument,
  data: CertificateData,
  text: Record<string, string>,
  top: number,
): number {
  let y = top;

  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(text['demonstrated']!, 0, y, {
    align: 'center',
  });
  y += 24;

  const left = 90;
  const width = doc.page.width - left * 2;

  for (const competency of data.achieved) {
    doc
      .roundedRect(left, y - 4, width, 26, 4)
      .fillColor('#eff6ff')
      .fill();

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(BRAND)
      .text(`KMK ${competency.code}`, left + 10, y + 3, { width: 60, lineBreak: false });

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(competency.name, left + 72, y + 3, { width: width - 140, lineBreak: false });

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(`${Math.round(competency.percentage)} %`, left + width - 60, y + 3, {
        width: 50,
        align: 'right',
        lineBreak: false,
      });

    y += 32;
  }

  if (data.notAchievedCount > 0) {
    /*
     * Se dice cuántas competencias se evaluaron sin alcanzar el nivel. Callarlo
     * daría a entender que el diploma cubre todo lo evaluado, y no es así.
     */
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(text['notAchieved']!.replace('{count}', String(data.notAchievedCount)), 0, y + 2, {
        align: 'center',
      });
    y += 18;
  }

  return y;
}

/** Pie con el resultado, la referencia y la advertencia de alcance. */
function drawFooter(
  doc: PDFKit.PDFDocument,
  data: CertificateData,
  text: Record<string, string>,
): void {
  const bottom = doc.page.height - 150;

  doc
    .lineWidth(0.5)
    .strokeColor(RULE)
    .moveTo(90, bottom)
    .lineTo(doc.page.width - 90, bottom)
    .stroke();

  const columns: Array<[string, string]> = [
    [text['result']!, `${Math.round(data.result.percentage)} %`],
    [
      text['grade']!,
      data.result.gradeValue === null
        ? '—'
        : `${data.result.gradeValue.toFixed(1)}${data.result.gradeLabel ? ` · ${data.result.gradeLabel}` : ''}`,
    ],
    [text['date']!, formatDate(data.result.submittedAt, data.language)],
  ];

  const columnWidth = (doc.page.width - 180) / columns.length;
  columns.forEach(([label, value], index) => {
    const x = 90 + columnWidth * index;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(label, x, bottom + 12, {
        width: columnWidth,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(value, x, bottom + 24, {
        width: columnWidth,
      });
  });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(text['levelHint']!, 90, bottom + 52, { width: doc.page.width - 180 })
    .text(text['footer']!, 90, bottom + 64, { width: doc.page.width - 180 });

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(INK)
    .text(
      `${text['serial']!}: ${data.serial}   ·   ${text['issued']!} ${formatDate(data.issuedAt, data.language)}`,
      90,
      doc.page.height - 62,
      { width: doc.page.width - 180, align: 'center' },
    );
}

/**
 * Compone el PDF y lo devuelve entero en memoria.
 *
 * Un diploma son unos pocos kilobytes y se pide de uno en uno; transmitirlo por
 * streaming complicaría el manejo de errores —una excepción a mitad del
 * documento dejaría un PDF corrupto ya enviado— sin ahorrar nada apreciable.
 */
export function renderCertificate(data: CertificateData): Promise<Buffer> {
  const text = TEXT[data.language];

  // Horizontal: es el formato de un diploma y evita que una lista de seis
  // competencias empuje el pie a una segunda página.
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawFrame(doc, text);

  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(INK)
    .text(text['title']!, 0, 118, { align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(text['certifies']!, 0, 156, { align: 'center' });

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(BRAND)
    .text(data.student.fullName, 0, 174, { align: 'center' });

  if (data.student.code) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(data.student.code, 0, 200, { align: 'center' });
  }

  const afterCompetencies = drawCompetencies(doc, data, text, 222);

  const assessmentLine = data.assessment.subject
    ? `${text['inAssessment']!} «${data.assessment.title}» · ${data.assessment.subject}`
    : `${text['inAssessment']!} «${data.assessment.title}»`;

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(INK)
    .text(assessmentLine, 90, afterCompetencies + 8, {
      width: doc.page.width - 180,
      align: 'center',
    });

  drawFooter(doc, data, text);

  doc.end();
  return finished;
}
