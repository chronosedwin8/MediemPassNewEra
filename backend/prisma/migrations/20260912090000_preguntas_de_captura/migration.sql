-- Preguntas que se responden con la cámara o el micrófono.
--
-- Selfie, respuesta en vídeo y nota de voz. Las tres se califican a mano: no
-- hay solución con la que comparar, hay una grabación que alguien mira.
--
-- Se añade además una clase de archivo propia. La grabación no es «evidencia»
-- —eso acompaña a una respuesta escrita y es opcional—: es la respuesta
-- entera, y distinguirlo permite que el borrado y los informes traten cada
-- cosa como lo que es.

ALTER TYPE "QuestionType" ADD VALUE 'SELFIE';
ALTER TYPE "QuestionType" ADD VALUE 'VIDEO_RESPONSE';
ALTER TYPE "QuestionType" ADD VALUE 'AUDIO_RESPONSE';

ALTER TYPE "StoredFileKind" ADD VALUE 'RESPONSE_MEDIA';
