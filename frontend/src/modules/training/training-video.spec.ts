import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/app/i18n';
import TrainingVideo from './TrainingVideo.vue';

/**
 * El reproductor de la capacitación.
 *
 * Lo que se prueba aquí no es que el vídeo se vea: es la lista blanca. Un
 * `<iframe>` que apunta a donde diga una cadena de la base de datos deja meter
 * contenido ajeno en una página autenticada, y quien edita un módulo no es
 * necesariamente quien debería poder hacer eso.
 *
 * El comportamiento correcto ante lo desconocido es degradar a enlace, nunca
 * incrustar. Estas pruebas fallan si alguien invierte esa decisión.
 */

function render(url: string) {
  return mount(TrainingVideo, {
    props: { url, title: 'Vídeo de prueba' },
    global: { plugins: [i18n] },
  });
}

describe('plataformas conocidas', () => {
  it('incrusta un vídeo de HeyGen traduciendo el enlace de compartir', () => {
    const wrapper = render('https://app.heygen.com/share/abc123');

    // Pegar la URL de compartir en un iframe no funciona: hay que llevarla a
    // la ruta del reproductor.
    expect(wrapper.find('iframe').attributes('src')).toBe('https://app.heygen.com/embeds/abc123');
  });

  it('usa el dominio de YouTube sin cookies', () => {
    const wrapper = render('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(wrapper.find('iframe').attributes('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('reproduce un archivo de vídeo sin iframe', () => {
    const wrapper = render('https://cdn.example.org/formacion/modulo-1.mp4');

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('video').attributes('src')).toBe(
      'https://cdn.example.org/formacion/modulo-1.mp4',
    );
  });
});

describe('lo que no está en la lista', () => {
  it('no incrusta un dominio desconocido: lo deja como enlace', () => {
    const wrapper = render('https://sitio-cualquiera.example/video/1');

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('a').attributes('href')).toBe('https://sitio-cualquiera.example/video/1');
  });

  it('no se deja engañar por un dominio que termina igual', () => {
    // `app.heygen.com.atacante.example` contiene el host permitido como texto.
    // Comparar por host completo y no por sufijo es lo que evita esto.
    const wrapper = render('https://app.heygen.com.atacante.example/share/abc123');

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(true);
  });

  it('descarta una URL que no es HTTPS', () => {
    const wrapper = render('http://app.heygen.com/share/abc123');

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('descarta algo que ni siquiera es una URL', () => {
    const wrapper = render('javascript:alert(1)');

    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });
});
