import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './sanitize.js';

/**
 * El saneado del contenido, ahora que el contenido lleva medios.
 *
 * Admitir `iframe` es lo que abre la puerta que estas pruebas vigilan: un
 * marco que apunte a donde diga la base de datos puede imitar esta página
 * entera dentro de una pantalla con sesión iniciada y pedir una contraseña.
 * Por eso no basta con permitir la etiqueta; la dirección tiene que estar en
 * la lista de plataformas conocidas.
 *
 * Si alguien amplía la lista blanca, estas pruebas son las que deben fallar.
 */

describe('lo que se puede incrustar', () => {
  it('conserva un vídeo de YouTube y le impone sus condiciones', () => {
    const limpio = sanitizeRichText(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>',
    );

    expect(limpio).toContain('https://www.youtube-nocookie.com/embed/abc123');
    // El cajón no es opcional: sin él, lo incrustado puede navegar la pestaña
    // que lo contiene hacia una página de inicio de sesión falsa.
    expect(limpio).toContain('sandbox=');
    expect(limpio).toContain('referrerpolicy="strict-origin-when-cross-origin"');
  });

  it('conserva un Genially', () => {
    const limpio = sanitizeRichText('<iframe src="https://view.genially.com/abc"></iframe>');
    expect(limpio).toContain('view.genially.com');
  });

  it('descarta un marco a un dominio cualquiera', () => {
    const limpio = sanitizeRichText(
      '<p>Antes</p><iframe src="https://sitio-cualquiera.example/login"></iframe><p>Después</p>',
    );

    expect(limpio).not.toContain('iframe');
    expect(limpio).not.toContain('sitio-cualquiera');
    // El resto del contenido sobrevive: se cae el marco, no la lección.
    expect(limpio).toContain('Antes');
    expect(limpio).toContain('Después');
  });

  it('no se deja engañar por un dominio que termina igual', () => {
    const limpio = sanitizeRichText(
      '<iframe src="https://www.youtube-nocookie.com.atacante.example/embed/x"></iframe>',
    );

    expect(limpio).not.toContain('iframe');
  });

  it('descarta un marco por HTTP aunque el dominio esté admitido', () => {
    const limpio = sanitizeRichText('<iframe src="http://view.genially.com/abc"></iframe>');
    expect(limpio).not.toContain('iframe');
  });

  it('no admite `srcdoc`: es HTML arbitrario por otra puerta', () => {
    const limpio = sanitizeRichText(
      '<iframe src="https://view.genially.com/abc" srcdoc="<script>alert(1)</script>"></iframe>',
    );

    expect(limpio).not.toContain('srcdoc');
  });
});

describe('medios propios', () => {
  it('conserva un vídeo servido por HTTPS, con controles', () => {
    const limpio = sanitizeRichText('<video src="https://cdn.example.org/clase.mp4"></video>');

    expect(limpio).toContain('clase.mp4');
    // Sin controles no hay forma de reproducirlo.
    expect(limpio).toContain('controls');
    expect(limpio).toContain('preload="metadata"');
  });

  it('conserva un audio', () => {
    const limpio = sanitizeRichText('<audio src="https://cdn.example.org/podcast.mp3"></audio>');
    expect(limpio).toContain('podcast.mp3');
  });

  it('descarta un vídeo sin cifrar', () => {
    const limpio = sanitizeRichText('<video src="http://cdn.example.org/clase.mp4"></video>');
    expect(limpio).not.toContain('cdn.example.org');
  });

  it('sigue descartando guiones y manejadores de evento', () => {
    const limpio = sanitizeRichText(
      '<p onclick="robar()">Texto</p><script>robar()</script><img src="x" onerror="robar()">',
    );

    expect(limpio).not.toContain('onclick');
    expect(limpio).not.toContain('onerror');
    expect(limpio).not.toContain('script');
    expect(limpio).toContain('Texto');
  });
});
