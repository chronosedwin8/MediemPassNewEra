import type { PublicContent } from './types';

/** Inhalte der Startseite und des Wikis auf Deutsch. */
export const de: PublicContent = {
  home: {
    hero: {
      eyebrow: 'Deutsche Schule Barranquilla',
      title: 'Medienpass',
      lead: 'Digitale Kompetenzen wirklich bewerten, nicht nur nutzen.',
      body: 'Fast jeder Unterricht nutzt heute digitale Medien. Nur wenige können sagen, welche konkrete digitale Kompetenz eine Schülerin am Dienstag geübt hat oder wie sich das übers Jahr verändert hat. Medienpass schließt diese Lücke: Jede Frage in der Plattform ist einer Kompetenz des KMK-Rahmens zugeordnet, und daraus entsteht ein Bild des Fortschritts – pro Schüler, pro Klasse und pro Kompetenz.',
    },

    why: {
      title: 'Warum digitale Medien bewertet und nicht nur eingesetzt werden müssen',
      lead: 'Technik in den Unterricht zu bringen ist einfach. Zu wissen, ob sie etwas lehrt, ist etwas anderes – und ohne das Zweite wird das Erste zur Dekoration.',
      points: [
        {
          tag: 'Das Problem',
          title: 'Nutzen ist nicht Verstehen',
          body: 'Wer das erste Suchergebnis abschreibt, hat ein digitales Werkzeug benutzt und keine Kompetenz gezeigt. Den Unterschied sieht man nicht, indem man über die Schulter schaut: Man muss fragen, und zwar so, dass Wiederholen von Überprüfen unterscheidbar wird.',
        },
        {
          tag: 'Die Folge',
          title: 'Was nicht gemessen wird, wird vermutet',
          body: 'Ohne Daten bildet sich jede Lehrkraft einen eigenen Eindruck davon, wie ihre Gruppe bei digitalen Kompetenzen steht – und diese Eindrücke lassen sich weder addieren noch vergleichen. Das Ergebnis ist eine Schule, die in Technik investiert und nicht sagen kann, was sie dafür bekommen hat.',
        },
        {
          tag: 'Der Ansatz',
          title: 'Eine Kompetenz pro Frage',
          body: 'Hier existiert keine Frage, ohne zu erklären, welche KMK-Kompetenz sie übt. Das ist keine Bürokratie: Es macht aus einer Prüfung einen Wert, der sich zwischen Fächern, Klassen und Jahren vergleichen lässt – und erlaubt die Erkenntnis, dass das Problem der 10. Klasse nicht «das Digitale» ist, sondern konkret die Bewertung von Quellen.',
        },
        {
          tag: 'Die Grenze',
          title: 'Daten orientieren, sie entscheiden nicht',
          body: 'Ein Prozentwert sagt, wohin man schauen soll, nicht was zu tun ist. Die Plattform bewertet nicht, was eine Lehrkraft von Hand korrigieren muss, veröffentlicht nichts ungelesen und reduziert niemanden auf eine Zahl: Jedes Ergebnis kommt mit der Aufschlüsselung nach Kompetenz und der Rückmeldung, die es erklärt.',
        },
      ],
    },

    frameworks: {
      title: 'Drei Rahmen, eine Aufgabe',
      lead: 'Die Schule bewegt sich zwischen drei Bezugssystemen, die meist getrennt präsentiert werden: dem KMK-Rahmen, den ISTE-Standards und der IB-Bildung. Sie konkurrieren nicht. Sie beschreiben dieselbe Kompetenz aus drei Blickwinkeln – was man kann, wie man es lehrt und welcher Mensch dabei entsteht.',

      kmk: {
        name: 'KMK-Rahmen',
        subtitle: 'Bildung in der digitalen Welt',
        intro:
          'Sechs Kompetenzen, von der Kultusministerkonferenz für das gesamte allgemeinbildende Schulwesen beschlossen. Es ist der Rahmen, den Medienpass misst: Jede Frage nennt eine, und die Statistik wird danach aggregiert.',
        items: [
          {
            tag: 'KMK 1',
            title: 'Suchen, Verarbeiten und Aufbewahren',
            body: 'Die Frage formulieren, bevor man sucht; sinnvoll eingrenzen; prüfen, wer verantwortet, was erscheint; und so aufbewahren, dass es wiederfindbar und zitierbar bleibt.',
          },
          {
            tag: 'KMK 2',
            title: 'Kommunizieren und Kooperieren',
            body: 'Mit anderen in geteilten Werkzeugen arbeiten, Umgangsregeln vereinbaren und eingreifen können, wenn etwas schiefgeht.',
          },
          {
            tag: 'KMK 3',
            title: 'Produzieren und Präsentieren',
            body: 'Von der Collage zur eigenen Produktion: das Format nach der Aussage wählen und das Urheberrecht achten.',
          },
          {
            tag: 'KMK 4',
            title: 'Schützen und sicher Agieren',
            body: 'Persönliche Daten schützen, Täuschung erkennen und wissen, was dann zu tun ist; Sicherheit als Praxis verstehen, nicht als Einstellung.',
          },
          {
            tag: 'KMK 5',
            title: 'Problemlösen und Handeln',
            body: 'Das passende Werkzeug wählen, sich behelfen, wenn es versagt, und genug von der Funktionsweise verstehen, um nicht auf fremde Hilfe angewiesen zu sein.',
          },
          {
            tag: 'KMK 6',
            title: 'Analysieren und Reflektieren',
            body: 'Das Medium sehen und nicht nur die Botschaft: wer es produziert, mit welcher Absicht, was ausgelassen wird und wie das wirkt.',
          },
        ],
        source: {
          label: 'KMK-Strategie (PDF)',
          url: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2021/2021_12_09-Lehren-und-Lernen-Digi.pdf',
        },
      },

      isteStudents: {
        name: 'ISTE · Lernende',
        subtitle: 'Sieben Lernrollen',
        intro:
          'Wo die KMK Kompetenzen beschreibt, beschreibt ISTE Rollen, die Lernende einnehmen. Das hilft beim Aufgabenentwurf: Es sagt, was sie tun sollen, nicht nur was sie wissen sollen.',
        items: [
          {
            tag: '1.1',
            title: 'Empowered Learner',
            body: 'Gestaltet die eigenen Lernziele aktiv mit und weist sie nach.',
          },
          {
            tag: '1.2',
            title: 'Digital Citizen',
            body: 'Verwaltet die digitale Identität, handelt sicher und ethisch, achtet geistiges Eigentum.',
          },
          {
            tag: '1.3',
            title: 'Knowledge Constructor',
            body: 'Baut Wissen aus Quellen auf, die er finden und bewerten konnte.',
          },
          {
            tag: '1.4',
            title: 'Innovative Designer',
            body: 'Entwirft Lösungen für echte Probleme und hält aus, dass der erste Versuch scheitert.',
          },
          {
            tag: '1.5',
            title: 'Computational Thinker',
            body: 'Zerlegt Probleme, erkennt Muster und prüft Annahmen mit Daten.',
          },
          {
            tag: '1.6',
            title: 'Creative Communicator',
            body: 'Wählt Medium und Format passend zum Gegenüber.',
          },
          {
            tag: '1.7',
            title: 'Global Collaborator',
            body: 'Erweitert die Perspektive durch Arbeit mit Menschen anderer Kontexte.',
          },
        ],
        source: {
          label: 'ISTE Standards for Students',
          url: 'https://iste.org/standards/students',
        },
      },

      isteEducators: {
        name: 'ISTE · Lehrkräfte',
        subtitle: 'Sieben professionelle Rollen',
        intro:
          'Das Gegenstück zum vorigen Rahmen. Es beschreibt, was die Lehrkraft tut, damit das Obige geschieht, und ist die Referenz der Fortbildungsmodule dieser Plattform.',
        items: [
          {
            tag: '2.1',
            title: 'Learner',
            body: 'Bildet sich weiter: setzt eigene Ziele und gleicht die Praxis mit anderen ab.',
          },
          {
            tag: '2.2',
            title: 'Leader',
            body: 'Treibt eine gemeinsame Vision des Lernens mit Technik in der Schule voran.',
          },
          {
            tag: '2.3',
            title: 'Citizen',
            body: 'Lebt verantwortliche digitale Teilhabe vor und lehrt sie durch Beispiel.',
          },
          {
            tag: '2.4',
            title: 'Collaborator',
            body: 'Nimmt sich Zeit für Zusammenarbeit mit Kollegium und Lernenden.',
          },
          {
            tag: '2.5',
            title: 'Designer',
            body: 'Entwirft authentische Aufgaben, die Unterschiede zwischen Lernenden anerkennen.',
          },
          {
            tag: '2.6',
            title: 'Facilitator',
            body: 'Begleitet Lernen mit Technik, statt es durch sie zu ersetzen.',
          },
          {
            tag: '2.7',
            title: 'Analyst',
            body: 'Nutzt Daten, um Fortschritt zu verstehen und den Unterricht anzupassen. Genau dieser Rolle dient die Statistik von Medienpass.',
          },
        ],
        source: {
          label: 'ISTE Standards for Educators',
          url: 'https://iste.org/standards/educators',
        },
      },

      ib: {
        name: 'IB-Lernprofil',
        subtitle: 'Zehn Eigenschaften, vier Programme',
        intro:
          'Das IB beschreibt keine digitalen Kompetenzen, sondern welcher Mensch gebildet wird. Deshalb konkurriert es nicht mit den anderen beiden Rahmen – es gibt ihnen den Sinn. Eine Kompetenz ohne die tragende Haltung ist eine Fertigkeit ohne Maßstab.',
        items: [
          {
            tag: 'Forschend',
            title: 'Inquirers',
            body: 'Pflegen Neugier und können selbstständig recherchieren.',
          },
          {
            tag: 'Wissbegierig',
            title: 'Knowledgeable',
            body: 'Erkunden Ideen von lokaler und globaler Bedeutung.',
          },
          {
            tag: 'Denkend',
            title: 'Thinkers',
            body: 'Analysieren kritisch und entscheiden begründet und ethisch.',
          },
          {
            tag: 'Kommunikativ',
            title: 'Communicators',
            body: 'Drücken sich klar aus und hören andere Sichtweisen an.',
          },
          {
            tag: 'Integer',
            title: 'Principled',
            body: 'Handeln ehrlich und stehen zu den Folgen ihres Tuns.',
          },
          {
            tag: 'Aufgeschlossen',
            title: 'Open-minded',
            body: 'Schätzen die eigene Kultur und öffnen sich für andere.',
          },
          {
            tag: 'Fürsorglich',
            title: 'Caring',
            body: 'Zeigen Empathie und engagieren sich für andere.',
          },
          {
            tag: 'Wagemutig',
            title: 'Risk-takers',
            body: 'Begegnen Unbekanntem mit Umsicht und ohne Angst vor Fehlern.',
          },
          {
            tag: 'Ausgewogen',
            title: 'Balanced',
            body: 'Achten auf die Balance von Geist, Körper und Gefühl.',
          },
          {
            tag: 'Reflektierend',
            title: 'Reflective',
            body: 'Bewerten das eigene Lernen und erkennen ihre Grenzen.',
          },
        ],
        source: {
          label: 'IB learner profile (PDF)',
          url: 'https://www.ibo.org/globalassets/new-structure/digital-toolkit/pdfs/learner-profile-2017-en.pdf',
        },
      },
    },

    crosswalk: {
      title: 'Wie sich die drei Rahmen überschneiden',
      lead: 'Die Tabelle behauptet keine exakten Entsprechungen. Sie zeigt, dass eine gut entworfene digitale Aufgabe alle drei Rahmen zugleich bedient – auch wenn man nur an einen gedacht hat.',
      caveat:
        'Die Zuordnungen sind Orientierung und stammen von der Schule, nicht von den Organisationen, die die Rahmen veröffentlichen. Keiner der drei definiert sich über die anderen.',
      columns: {
        kmk: 'KMK-Kompetenz',
        iste: 'ISTE (Lernende / Lehrkraft)',
        ib: 'IB-Lernprofil',
        practice: 'Wie das im Unterricht aussieht',
      },
      rows: [
        {
          kmk: '1 · Suchen, Verarbeiten, Aufbewahren',
          iste: 'Knowledge Constructor / Facilitator',
          ib: 'Forschend, Denkend',
          practice:
            'Eine strittige Behauptung und drei Quellen dazu suchen – und herausfinden, ob sie unabhängig sind oder voneinander abschreiben.',
        },
        {
          kmk: '2 · Kommunizieren und Kooperieren',
          iste: 'Global Collaborator / Collaborator',
          ib: 'Kommunikativ, Aufgeschlossen',
          practice:
            'Ein geteiltes Dokument mit vorher vereinbarten Regeln, bei dem der Versionsverlauf Teil der Bewertung ist.',
        },
        {
          kmk: '3 · Produzieren und Präsentieren',
          iste: 'Creative Communicator / Designer',
          ib: 'Wagemutig, Kommunikativ',
          practice:
            'Ein zweiminütiges Erklärvideo aufnehmen und die Quelle jedes verwendeten Bildes nennen.',
        },
        {
          kmk: '4 · Schützen und sicher Agieren',
          iste: 'Digital Citizen / Citizen',
          ib: 'Integer, Fürsorglich',
          practice:
            'Einen echten Fall von Identitätsmissbrauch analysieren und Schritt für Schritt entscheiden, was die Klasse täte.',
        },
        {
          kmk: '5 · Problemlösen und Handeln',
          iste: 'Computational Thinker / Analyst',
          ib: 'Denkend, Wagemutig',
          practice:
            'Ein Werkzeug versagt – dokumentieren, was in welcher Reihenfolge probiert wurde und was geholfen hat.',
        },
        {
          kmk: '6 · Analysieren und Reflektieren',
          iste: 'Empowered Learner / Leader',
          ib: 'Reflektierend, Ausgewogen',
          practice:
            'Vergleichen, wie drei Medien dasselbe Ereignis erzählen, und erklären, was jedes auslässt und wem das nützt.',
        },
      ],
    },

    ibLevels: {
      title: 'In jeder IB-Stufe',
      lead: 'Die Eigenschaften des Lernprofils sind von vier bis achtzehn dieselben; was sich ändert, ist, was es heißt, sie zu leben. Digitale Kompetenz begleitet diesen Weg, statt plötzlich in der Sekundarstufe aufzutauchen.',
      levels: [
        {
          tag: 'PYP',
          title: 'Primary Years Programme',
          body: 'Forschen beginnt vor dem flüssigen Lesen. Digitale Kompetenz ist hier vor allem Gewohnheit: fragen, woher ein Bild stammt, verstehen, dass Veröffentlichtes bleibt, und anfangen zu produzieren statt nur zu konsumieren.',
        },
        {
          tag: 'MYP',
          title: 'Middle Years Programme',
          body: 'Das Urteil kommt hinzu. Es wird nicht nur gesucht: Quellen werden verglichen, Absichten erkannt und Folgen des Teilens übernommen. In dieser Stufe lassen sich die sechs KMK-Kompetenzen am klarsten prüfen.',
        },
        {
          tag: 'DP',
          title: 'Diploma Programme',
          body: 'Der Anspruch wird akademisch. Richtig zu zitieren ist keine Schulregel mehr, sondern intellektuelle Redlichkeit; Extended Essay und Theory of Knowledge prüfen genau das, was die Kompetenzen 1 und 6 messen.',
        },
        {
          tag: 'CP',
          title: 'Career-related Programme',
          body: 'Das Ziel ist die Arbeitswelt, in der digitale Kompetenz danach beurteilt wird, was man kann, nicht was man studiert hat. Produzieren, Kooperieren und Problemlösen wiegen schwerer als Auswendiglernen.',
        },
      ],
    },

    smart: {
      title: 'Auch das Formulieren des Ziels wird bewertet',
      lead: 'Bevor man misst, ob jemand besser geworden ist, kommt etwas anderes: sagen zu können, worin man besser werden will. Die Plattform behandelt das als eigene Kompetenz und bewertet sie mit dem SMART-Raster.',
      caveat:
        'SMART ist kein Bewertungskriterium, sondern ein Rahmen zum Formulieren von Zielen. Deshalb wird hier nicht bewertet, ob das Ziel erreicht wurde – das entscheidet sich in sechs Wochen –, sondern wie es geschrieben ist. Ein Ziel kann tadellos formuliert und trotzdem nicht erreicht werden; das sind zwei Urteile, und das Raster fällt nur das erste.',
      columns: { dimension: 'Dimension', indicator: 'Was beobachtet wird' },
      rows: [
        {
          letter: 'S',
          name: 'Spezifisch',
          indicator: 'Sagt klar, was getan wird, wozu und gegebenenfalls wie.',
        },
        {
          letter: 'M',
          name: 'Messbar',
          indicator:
            'Enthält Menge, Prozent, Häufigkeit oder etwas, woran sich das Erreichen prüfen lässt.',
        },
        {
          letter: 'A',
          name: 'Erreichbar',
          indicator: 'Ist mit der verfügbaren Zeit, den Mitteln und dem Wissen möglich.',
        },
        {
          letter: 'R',
          name: 'Relevant',
          indicator: 'Hat einen klaren Zweck und antwortet auf einen Bedarf oder ein Ziel.',
        },
        {
          letter: 'T',
          name: 'Terminiert',
          indicator: 'Legt eine Frist oder einen konkreten Zeitraum fest.',
        },
      ],
      scale: {
        title: 'Wie bewertet wird',
        lead: 'Jede Dimension wird von 0 bis 4 bewertet, ein Ziel zählt also 20 Punkte. Fünf Stufen und nicht zwei: bei «erfüllt oder nicht» fällt der ganze Mittelbereich – das Ziel mit vager Frist oder das, was etwas misst, ohne zu sagen wie viel – auf dieselbe Seite, und dort sind fast alle Lernenden.',
        levels: [
          '0 · Nicht erfüllt: das Kriterium fehlt',
          '1 · Anfang: es gibt einen minimalen Beleg',
          '2 · Grundlegend: teilweise erfüllt',
          '3 · Angemessen: erfüllt mit kleinen Mängeln',
          '4 · Ausgezeichnet: vollständig erfüllt',
        ],
        bands: [
          { range: '18–20', label: 'Ausgezeichnet' },
          { range: '15–17', label: 'Hoch' },
          { range: '11–14', label: 'Grundlegend' },
          { range: '6–10', label: 'Niedrig' },
          { range: '0–5', label: 'Anfang' },
        ],
      },
      example: {
        title: 'Dieselbe Absicht, zwei Formulierungen',
        weak: {
          goal: 'Ich will in Mathematik besser werden.',
          verdict:
            'Spezifisch 1, Messbar 0, Erreichbar 2, Relevant 3, Terminiert 0. Gesamt 6 von 20: kein Aspekt genannt, kein Indikator, keine Frist.',
        },
        strong: {
          goal: 'In der nächsten Prüfung in Mathematik von 70 auf 85 Punkte kommen, indem ich in den nächsten 6 Wochen täglich 30 Minuten übe.',
          verdict:
            'Alle fünf Dimensionen sind überprüfbar: was besser wird, um wie viel, mit welchem Aufwand, wozu und bis wann.',
        },
      },
    },
    access: {
      title: 'Zur Plattform',
      lead: 'Der Zugang ist für alle gleich – mit der schulischen E-Mail. Was sich unterscheidet, ist, was drinnen wartet. Wenn du unsicher bist: einfach anmelden, die Plattform bringt dich an die richtige Stelle.',
      roles: [
        {
          key: 'student',
          title: 'Schülerinnen und Schüler',
          body: 'Deine E-Mail ist dein vierstelliger Code gefolgt von @colegioaleman.edu.co. Wenn du noch kein Passwort hast, vergibt es die Schule.',
          bullets: [
            'Zugewiesene Prüfungen sehen und bearbeiten',
            'Einen begonnenen Versuch ohne Verlust fortsetzen',
            'Note, Aufschlüsselung nach Kompetenz und Rückmeldung einsehen',
          ],
        },
        {
          key: 'teacher',
          title: 'Lehrkräfte',
          body: 'Mit der schulischen E-Mail. Anmeldung mit Passwort oder, falls aktiviert, mit dem Microsoft-Konto der Schule.',
          bullets: [
            'Prüfungen erstellen – auf Wunsch mit KI – und vor dem Veröffentlichen ansehen',
            'Gruppen zuweisen und offene Antworten bewerten',
            'Ergebnisse pro Klasse und die eigene KMK-Fortbildung einsehen',
          ],
        },
        {
          key: 'admin',
          title: 'Verwaltung',
          body: 'Für die Koordination: akademische Struktur, Berechtigungen und Fortbildungsinhalte.',
          bullets: [
            'Einschreibung mit Phidias synchronisieren und das Schuljahr eröffnen',
            'Fortbildungsmaterial schreiben und veröffentlichen',
            'Rollenrechte, KI und gespeicherte Dateien verwalten',
          ],
        },
      ],
    },
  },

  wiki: {
    title: 'So wird Medienpass benutzt',
    lead: 'Eine Anleitung nach Aufgaben, nicht nach Bildschirmen: was du tun willst und wie es geht. Sie ist so geschrieben, dass man sie vor der ersten Anmeldung lesen kann.',
    audiences: {
      all: 'Alle',
      teacher: 'Lehrkräfte',
      student: 'Lernende',
      admin: 'Verwaltung',
    },
    sections: [
      {
        id: 'acceso',
        title: 'Die erste Anmeldung',
        audience: 'all',
        lead: 'Alle melden sich an derselben Stelle an. Was sich danach unterscheidet, ist das Menü links – es hängt davon ab, was dein Konto darf.',
        steps: [
          {
            title: 'Nutze deine schulische E-Mail',
            body: 'Bei Lernenden ist es der vierstellige Code plus @colegioaleman.edu.co. Bei Lehrkräften die übliche Schul-E-Mail.',
            tip: 'Wenn die Anmeldedaten als ungültig gemeldet werden und die E-Mail sicher stimmt, hat dein Konto vielleicht noch kein Passwort. Das löst die Verwaltung, nicht ein Passwortwechsel.',
          },
          {
            title: 'Ändere das vorläufige Passwort',
            body: 'Von der Schule vergebene Passwörter werden vorgelesen oder auf Listen gedruckt. Die Plattform verlangt den Wechsel, bevor irgendetwas anderes möglich ist – das ist keine Schikane: Dieses Passwort war in fremden Händen.',
          },
          {
            title: 'Wähle deine Sprache',
            body: 'Oben rechts. Die Oberfläche gibt es auf Spanisch, Deutsch und Englisch, und die Wahl wird gemerkt. Die Sprache der Inhalte bestimmt, wer sie geschrieben hat.',
          },
        ],
        screen: {
          title: 'Anmeldebildschirm',
          caption: 'Für Lernende, Lehrkräfte und Verwaltung derselbe.',
          regions: [
            { label: 'Schulische E-Mail', note: 'code@colegioaleman.edu.co', emphasis: true },
            { label: 'Passwort', note: 'Das vorläufige verfällt beim ersten Gebrauch' },
            { label: 'Anmelden', note: 'Hauptschaltfläche', emphasis: true },
            { label: 'Anmeldung mit Microsoft', note: 'Falls von der Schule aktiviert' },
            { label: 'Sprache', note: 'Español · Deutsch · English' },
          ],
        },
        faq: [
          {
            question: 'Geht das auch am Handy?',
            answer:
              'Ja. Die Plattform ist für kleine Bildschirme gedacht, und besonders die Prüfungsansicht ist auf dem Tablet getestet – dem üblichsten Format im Unterricht.',
          },
          {
            question: 'Ich habe mein Passwort vergessen.',
            answer:
              'Frag die Verwaltung. Es gibt bewusst keine automatische Wiederherstellung per E-Mail: Viele Lernende teilen sich ein Gerät, und ein Zurücksetzen-Link in einem geteilten Postfach ist ein geteiltes Konto.',
          },
        ],
      },

      {
        id: 'estudiante-evaluacion',
        title: 'Eine Prüfung bearbeiten',
        audience: 'student',
        lead: 'Alles, was du schreibst, wird beim Schreiben gespeichert. «Speichern» musst du nie drücken.',
        steps: [
          {
            title: 'Öffne «Meine Prüfungen»',
            body: 'Dort stehen die zugewiesenen und die bereits abgegebenen. Jede zeigt die verbleibenden Versuche und bis wann sie offen ist.',
          },
          {
            title: 'Antworte in beliebiger Reihenfolge',
            body: 'Mit der Übersicht unten springst du hin und her. Beantwortete Fragen sind markiert, offene ebenfalls.',
            tip: 'Wenn der Browser schließt oder die Verbindung abbricht: neu anmelden und weitermachen. Der Versuch wartet mit allem, was du geschrieben hattest.',
          },
          {
            title: 'Speichere und mach später weiter, wenn es erlaubt ist',
            body: 'Hat die Prüfung kein Zeitlimit, steht das oben und unten erscheint «Speichern und später weitermachen». Du kannst schließen und zurückkommen, wann du willst: der Versuch wartet mit allem Geschriebenen.',
            tip: 'Hat sie ein Zeitlimit, gibt es diesen Knopf nicht und stattdessen läuft die Uhr. Die Frist läuft ab dem Öffnen weiter, auch wenn du die Seite schließt – beende sie besser in einem Zug.',
          },
          {
            title: 'Hänge Nachweise an, wenn verlangt',
            body: 'Manche Fragen erlauben Fotos, Dokumente oder Audio. Ist der Nachweis Pflicht, steht es an der Frage und ohne ihn kannst du nicht abgeben.',
            tip: 'Lade die Datei hoch, sobald du sie hast, nicht am Schluss. Fünf Uploads in der letzten Minute konkurrieren um dieselbe Schulverbindung.',
          },
          {
            title: 'Gib ab, wenn du sicher bist',
            body: 'Beim Abgeben wird Ausstehendes gespeichert und der Versuch geschlossen. Das lässt sich nicht rückgängig machen.',
          },
        ],
        screen: {
          title: 'Während der Prüfung',
          caption: 'Die Zeit führt der Server: Neuladen setzt sie nicht zurück.',
          regions: [
            { label: 'Kopfleiste', note: 'Titel, Restzeit und Speicherstatus' },
            {
              label: 'Aufgabenstellung',
              note: 'Mit Format, Bildern und der gemessenen KMK-Kompetenz',
            },
            { label: 'Deine Antwort', note: 'Speichert sich beim Schreiben', emphasis: true },
            { label: 'Nachweis', note: 'Nur wenn die Frage ihn erlaubt' },
            { label: 'Fragenübersicht', note: 'Beantwortet, offen und aktuell', emphasis: true },
          ],
        },
        faq: [
          {
            question: 'Was passiert, wenn die Zeit beim Schreiben abläuft?',
            answer:
              'Der Versuch schließt mit dem Gespeicherten. Die Zeit steuert der Server, die Uhr auf deinem Bildschirm ist nur Information: Neuladen bringt keine Minuten.',
          },
          {
            question: 'Ich sehe meine Note, verstehe sie aber nicht.',
            answer:
              'Unter der Note steht die Aufschlüsselung nach KMK-Kompetenz und die Rückmeldung zu jeder Frage. Bei offenen Antworten kann sich die Note noch ändern, wenn deine Lehrkraft fertig korrigiert hat.',
          },
        ],
      },

      {
        id: 'estudiante-resultados',
        title: 'Dein Ergebnis verstehen',
        audience: 'student',
        lead: 'Die Note folgt der deutschen Skala: 1,0 ist das beste Ergebnis, 6,0 das schlechteste. Sterne begleiten die Zahl, sie ersetzen sie nicht.',
        steps: [
          {
            title: 'Schau zuerst auf die Aufschlüsselung',
            body: 'Der Gesamtwert sagt, wie es lief; die Aufschlüsselung sagt, worin. «Quellen bewerten» zu verfehlen ist nicht dasselbe wie «produzieren und präsentieren», und mehr vom Gleichen zu lernen hilft bei keinem von beiden.',
          },
          {
            title: 'Vorsicht mit den Sternen',
            body: 'Fünf Sterne bedeuten 1,0, die beste Note. Das ist umgekehrt wie in einem Shop, und deshalb zeigt die Plattform sie nie allein: immer mit Zahl und Wort.',
          },
          {
            title: 'Schau auf dein Dashboard für das Gesamtbild',
            body: 'Die Startseite fasst alles Deine zusammen: wie viele Prüfungen du erledigt hast und wie viele fehlen, deinen Notendurchschnitt, wie lange sie dich im Schnitt kosten und auf welchem Platz du in deiner Klasse stehst.',
            tip: 'Der Platz zählt über den Schnitt all deiner Prüfungen und nur unter denen, die schon ein Ergebnis haben. «Platz 6 von 6» in einer Klasse von zweiunddreißig heißt nicht, dass du Letzter bist: es heißt, dass erst sechs etwas abgegeben haben.',
          },
          {
            title: 'Lies die Rückmeldung',
            body: 'Zu jeder Frage steht, warum die richtige Antwort richtig ist. Das ist der Teil, der wirklich etwas lehrt; die Note fasst nur zusammen.',
          },
        ],
      },

      {
        id: 'docente-crear',
        title: 'Eine Prüfung erstellen und veröffentlichen',
        audience: 'teacher',
        lead: 'Eine Prüfung hat Versionen. Als Entwurf ist alles änderbar; veröffentlicht ist sie eingefroren – und genau das sorgt dafür, dass ein Ergebnis vom März im November noch dasselbe bedeutet.',
        steps: [
          {
            title: 'Lege die Prüfung an',
            body: 'Titel, Fach, Jahrgang und Sprache. Sie entsteht mit ihrer ersten Version als Entwurf.',
          },
          {
            title: 'Füge Fragen hinzu',
            body: 'Dreizehn Typen, von Einfachauswahl bis Ordnen, Zuordnen oder Bereiche in einem Bild markieren. Jede Frage muss angeben, welche KMK-Kompetenz sie übt.',
            tip: 'Diese Angabe trägt alles Weitere. Eine nachlässig etikettierte Frage verfälscht die Statistik der ganzen Klasse, und niemand merkt es, bis die Zahlen keinen Sinn mehr ergeben.',
          },
          {
            title: 'Entscheide über Nachweise',
            body: 'Pro Frage kannst du Anhänge erlauben und für die Abgabe verpflichtend machen. Standardmäßig aus: Eine Datei zu verlangen, die niemand braucht, ist Reibung für die Lernenden und Speicher, den jemand löschen muss.',
          },
          {
            title: 'Vorschau vor dem Veröffentlichen',
            body: 'Über «Vorschau» siehst du die Prüfung genau so, wie die Klasse sie sieht, und kannst sie testweise beantworten, ohne dass etwas gespeichert wird. Mit «Lösungen anzeigen» prüfst du zusätzlich, ob die markierte Antwort stimmt.',
            tip: 'Bei KI-erzeugten Fragen ist dieser Schritt unverzichtbar. Eine Frage kann formal einwandfrei sein und die falsche Option als richtig markiert haben; keine automatische Prüfung erkennt das, ein Mensch schon.',
          },
          {
            title: 'Entscheide über die Zeit – und damit über das Pausieren',
            body: 'In den Versionseinstellungen kannst du eine Dauer in Minuten setzen. Null heißt ohne Limit. Beides hängt zusammen: ohne Zeit kann die Klasse speichern und später weitermachen, mit Zeit nicht, weil die Frist ab dem Öffnen läuft, auch bei geschlossener Seite.',
            tip: 'Setz eine Zeit, wenn das Tempo Teil dessen ist, was du prüfst. Sollen sie in Ruhe suchen, vergleichen und schreiben, misst ein offenes Zeitfenster genau das besser.',
          },
          {
            title: 'Schalte das Zeugnis ein, wenn du zertifizieren willst',
            body: 'Mit eingeschaltetem Zeugnis kann jede Person, die besteht, ein PDF herunterladen, das die nachgewiesenen KMK-Kompetenzen bescheinigt. Es lässt sich auch bei bereits veröffentlichter Prüfung einschalten – dann fällt es einem ja meist ein.',
            tip: 'Bescheinigt werden nur Kompetenzen mit mindestens 70 % in den sie messenden Fragen, und das Dokument nennt, wie viele geprüft wurden, ohne das zu erreichen. Ein Zeugnis, das zu viel behauptet, nützt niemandem.',
          },
          {
            title: 'Veröffentlichen und zuweisen',
            body: 'Mit dem Veröffentlichen wird die Version unveränderlich. Danach weist du sie einer deiner Gruppen zu, mit Zeitraum und Versuchszahl.',
            tip: 'Zuweisen kannst du nur Gruppen, die du leitest. Eine leere Auswahlliste ist kein Fehler: Du bist in keiner als Klassenleitung eingetragen – das klärt die Verwaltung.',
          },
          {
            title: 'Verlange ein Foto, ein Video oder eine Sprachnachricht',
            body: 'Drei Fragetypen werden durch Aufnehmen beantwortet: ein Selfie, ein Video von bis zu drei Minuten und eine Sprachnachricht von bis zu fünf. Sie zeigen, was Text nicht zeigt: dass jemand laut erklären kann, was er verstanden hat, oder dass der beschriebene Aufbau wirklich existiert.',
            tip: 'Kamera und Mikrofon funktionieren nur über HTTPS oder auf dem Rechner selbst. Wenn du sie im Unterricht über die Netzwerkadresse nutzen willst, sag vorher der Person Bescheid, die die Plattform bereitstellt – sonst gibt es am Prüfungstag keine Kamera.',
          },
          {
            title: 'Korrigiere, was die Maschine nicht kann',
            body: 'Offene und aufgenommene Antworten bleiben zur Bewertung offen. Unter «Korrigieren» stehen sie alle zusammen, die ältesten zuerst, mit Video oder Audio direkt abspielbar: du trägst Note und Kommentar ein, ohne jeden Versuch zu öffnen.',
          },
        ],
        screen: {
          title: 'Prüfungsdetail',
          caption: 'Im Entwurf erscheinen die Bearbeitungs-, veröffentlicht die Nutzungsaktionen.',
          regions: [
            { label: 'Kopfbereich', note: 'Titel, Status, Version, Fragen und Punkte' },
            {
              label: 'Aktionen',
              note: 'Vorschau · Bearbeiten · Veröffentlichen · Zuweisen · Ergebnisse',
              emphasis: true,
            },
            { label: 'Fragenliste', note: 'Mit KMK-Kompetenz und Punkten' },
            { label: 'Frageneditor', note: 'Formatierter Text, Bild und Nachweis', emphasis: true },
            { label: 'Versionsverlauf', note: 'Was wann veröffentlicht wurde' },
          ],
        },
        faq: [
          {
            question: 'In einer veröffentlichten Frage ist ein Fehler.',
            answer:
              'Lege eine neue Version an: Sie kopiert die Fragen und lässt sie korrigieren. Bereits abgelegte Versuche verweisen weiter auf ihre Version, kein erteiltes Ergebnis ändert sich.',
          },
          {
            question: 'Kann ich eine Prüfung mit Noten löschen?',
            answer:
              'Nur die Verwaltung, und nur durch Eintippen des Titels. Vorher zeigt die Plattform, wie viele Versuche von wie vielen Lernenden zerstört werden. Es gibt kein Zurück.',
          },
        ],
      },

      {
        id: 'docente-ia',
        title: 'Fragen mit KI erzeugen',
        audience: 'teacher',
        lead: 'Die KI schlägt vor, du entscheidest. Alles Erzeugte entsteht als Entwurf und erreicht niemanden, bis du es liest und veröffentlichst.',
        steps: [
          {
            title: 'Beschreibe das Thema',
            body: 'Ein kurzer Satz. «Der Wasserkreislauf», «Quellenprüfung im Internet».',
          },
          {
            title: 'Schreibe den Kontext – darauf kommt es an',
            body: 'Was im Unterricht behandelt wurde, mit welchen Werkzeugen gearbeitet wird, welches Vokabular zu nutzen und was zu vermeiden ist. Das unterscheidet eine allgemeine Prüfung von einer, die zu deiner Gruppe passt.',
            tip: 'Ein echtes Beispiel: «6. Klasse. Verdunstung und Kondensation haben wir mit einem Glas-und-Eis-Versuch behandelt. Versickerung noch nicht. Vermeide Beispiele mit Schnee: hier schneit es nicht.» Das Modell nutzte den Versuch in einer Frage und erwähnte keinen Schnee.',
          },
          {
            title: 'Wähle Kompetenzen und Typen',
            body: 'Mindestens eine KMK-Kompetenz. Angeboten werden nur Typen, die das Modell gut erzeugt: keine, die Koordinaten auf einem ungesehenen Bild verlangen.',
          },
          {
            title: 'Prüfe den Entwurf',
            body: 'Öffne die Vorschau mit sichtbaren Lösungen und lies sie. Eine Frage ohne markierte richtige Antwort wird rot hervorgehoben.',
          },
        ],
        faq: [
          {
            question: 'Die erzeugten Fragen hatten nichts mit dem Thema zu tun.',
            answer:
              'Dann läuft die Plattform im Simulationsmodus ohne API-Schlüssel. Dort kommen Platzhalter mit richtiger Struktur, aber ohne Inhalt. Das Formular weist vor dem Erzeugen darauf hin.',
          },
          {
            question: 'Wie lange dauert es?',
            answer:
              'Etwa 25 Sekunden für fünf Fragen und bis zu anderthalb Minuten für dreißig. Schließe die Seite nicht, während gearbeitet wird.',
          },
        ],
      },

      {
        id: 'docente-resultados',
        title: 'Ergebnisse einer Gruppe lesen',
        audience: 'teacher',
        lead: 'Es gibt zwei Ansichten für zwei Fragen: «wie steht die Klasse insgesamt» und «wie lief genau diese Prüfung».',
        steps: [
          {
            title: 'Schau zuerst, wie viele begonnen haben',
            body: 'In den Gruppenergebnissen steht «nicht begonnen» vor dem Durchschnitt. 40 % Schnitt bei halber Klasse ohne Start sagt nichts über den Unterricht.',
          },
          {
            title: 'Vergleiche die Form, nicht nur den Schnitt',
            body: 'Die Verteilung nach Notenband zeigt, ob die Gruppe homogen oder zweigeteilt ist. Gleicher Schnitt kann verschiedene Unterrichtsentscheidungen verlangen.',
          },
          {
            title: 'Sieh dir die am häufigsten verfehlten Fragen an',
            body: 'Sortiert nach beobachteter Schwierigkeit, nicht nach der beim Schreiben angegebenen. Weichen beide ab, liegt es meist an der Formulierung.',
          },
          {
            title: 'Fang bei deinem Dashboard an',
            body: 'Die Startseite bündelt, was du erstellt hast, wie viele du erreicht hast, was unbegonnen liegt und was du noch korrigieren musst. Die Zahl «abgedeckte Kompetenzen» verändert die Praxis am meisten: sie zeigt sofort, ob du das Jahr über nur zwei von sechs misst.',
            tip: 'Am Ende steht deine eigene KMK-Fortbildung, bewusst vom Rest getrennt. Der Schnitt einer Klasse kann vieles bedeuten, und fast nichts davon ist ein Urteil über die Lehrkraft.',
          },
          {
            title: 'Geh in die Aufschlüsselung, wenn der Schnitt nicht reicht',
            body: 'Unter Statistik zeigt die Aufschlüsselung nach Kompetenz dieselbe Zahl nach Fach, nach Klasse oder Kind für Kind. Dort sieht man, dass das Problem der Klasse nicht «das Digitale» ist, sondern konkret Kompetenz 6 – oder dass zwei Lernende seit Monaten nicht mitkommen, während der Schnitt das verdeckt.',
            tip: 'Erst nach Klasse filtern, dann nach Lernenden schauen: die Tabelle wird zur Klassenliste. «Nicht gemessen» ist keine Null, sondern eine Kompetenz, die dort noch nicht geprüft wurde.',
          },
          {
            title: 'Nutze das KMK-Radar für Entscheidungen',
            body: 'Nicht gemessene Kompetenzen erscheinen als null und verschwinden nicht aus der Grafik – so fällt auf, wenn «Analysieren und Reflektieren» das ganze Jahr ungeprüft blieb.',
          },
        ],
      },

      {
        id: 'docente-capacitacion',
        title: 'Deine eigene KMK-Fortbildung',
        audience: 'teacher',
        lead: 'Sechs Module, eines je Kompetenz, mit Material und Prüfung am Ende. Die Prüfung nutzt dieselbe Engine wie bei den Lernenden – du erlebst also genau das, was sie erleben werden.',
        steps: [
          {
            title: 'Arbeite das Material durch',
            body: 'Jeder geöffnete Block zählt als gesehen. Es gibt Texte, Aktivitäten und geprüfte externe Ressourcen: KMK-Strategie, Medienkompetenzrahmen NRW, klicksafe, Internet-ABC, INTEF und Common Sense.',
          },
          {
            title: 'Lege die Modulprüfung ab',
            body: 'Fünf Versuche. Die Bestehensgrenze für Lehrkräfte liegt bei 80 %, strenger als die 70 % der Lernenden, und wird vorher genannt.',
          },
          {
            title: 'Zertifiziere dich',
            body: 'Das Material durchzuarbeiten zertifiziert nicht; die bestandene Prüfung tut es. Das ist bewusst zweierlei.',
          },
        ],
      },

      {
        id: 'admin-contenido',
        title: 'Fortbildungsmaterial schreiben',
        audience: 'admin',
        lead: 'Das Material entsteht in Blöcken je Modul. Nichts ist sichtbar, bis es veröffentlicht wird.',
        steps: [
          {
            title: 'Modul anlegen',
            body: 'Kurzer, stabiler Code, KMK-Kompetenz, Titel und Beschreibung. Entsteht als Entwurf.',
          },
          {
            title: 'Blöcke hinzufügen',
            body: 'Text, Video, Dokument, Link oder Aktivität. Jeweils mit Titel, formatiertem Text und bei Bedarf Anhängen.',
            tip: 'Mehrere kurze Blöcke wirken besser als ein langer: Lehrkräfte klappen sie nacheinander auf, und der Fortschritt misst sich daran. Ein Block von zehn Seiten macht daraus einen Schalter.',
          },
          {
            title: 'Bild und Anhang unterscheiden',
            body: 'Das Bild zum Absatz wird im Text eingefügt, über die Symbolleiste. Das PDF zum Herunterladen ist ein Anhang. Zwei verschiedene Dinge, zwei verschiedene Verhalten.',
          },
          {
            title: 'Veröffentlichen',
            body: 'Ein Modul ohne Material lässt sich nicht veröffentlichen. Danach kannst du zurückziehen oder archivieren; Archivieren bewahrt den Fortschritt derer, die es schon absolviert haben.',
          },
        ],
        screen: {
          title: 'Moduleditor',
          caption: 'Blöcke werden mit Pfeilen sortiert und zum Bearbeiten aufgeklappt.',
          regions: [
            {
              label: 'Kopfbereich',
              note: 'Status, Code und Veröffentlichungsaktionen',
              emphasis: true,
            },
            { label: 'Moduldaten', note: 'Titel und Beschreibung in drei Sprachen' },
            { label: 'Blöcke', note: 'Zugeklappt; einzeln zum Bearbeiten öffnen', emphasis: true },
            { label: 'Blockeditor', note: 'Formatierter Text, Bilder, Link und Anhänge' },
            { label: 'Verknüpfte Prüfung', note: 'Die das Modul zertifiziert' },
          ],
        },
      },

      {
        id: 'admin-plataforma',
        title: 'Die Plattform verwalten',
        audience: 'admin',
        lead: 'Vier Bereiche: Rollenrechte, Einstellungen, Schuljahr und Dateien. Seltene Vorgänge mit großer Reichweite – die Oberfläche ist darauf ausgelegt, sie bewusst zu tun, nicht schnell.',
        steps: [
          {
            title: 'Rollenrechte',
            body: 'Was jede Rolle darf, ohne Deployment änderbar. Die Administratorrolle ist gesperrt: Könnte man ihr Rechte entziehen, bliebe nach einem Versehen niemand übrig, der sie zurückgibt.',
          },
          {
            title: 'Mit Phidias synchronisieren',
            body: 'Holt die echte Einschreibung. Die E-Mail jedes Lernenden leitet sich aus dem Code ab; die private Adresse, die Phidias manchmal führt, ist der Familienkontakt und dient nicht als Identität.',
          },
          {
            title: 'Schuljahr eröffnen',
            body: 'Erstellt das neue Jahr und repliziert die Gruppen leer; die Einschreibung kommt danach über Phidias. Das Vorjahr bleibt mit allen Noten unverändert.',
            tip: 'Das Löschen der Nachweise des endenden Jahres ist standardmäßig aus. Das Vorjahr behält seine Noten, und eine Note zu einem Nachweis, den es nicht mehr gibt, lässt sich später von niemandem begründen.',
          },
          {
            title: 'Gespeicherte Dateien',
            body: 'Was es gibt, wie viel Platz und pro Jahr. Zum Löschen: Umfang wählen, simulieren, prüfen, bestätigen. Vom Gelöschten gibt es keine Kopie.',
          },
        ],
      },

      {
        id: 'smart',
        title: 'SMART-Ziele',
        audience: 'all',
        lead: 'Eine Frage, die durch das Schreiben eines Ziels beantwortet und mit einem Raster aus fünf Dimensionen bewertet wird. Bewertet wird die Formulierung, nicht ob das Ziel erreicht wurde.',
        steps: [
          {
            title: 'Versteh, was gemessen wird',
            body: 'SMART ist ein Rahmen zum Formulieren von Zielen, kein Bewertungskriterium. Das Raster beurteilt die Formulierung: ob sie sagt was, wie viel, mit welchen Mitteln, wozu und bis wann. Ein Ziel kann tadellos sein und nicht erreicht werden; das ist ein anderes Gespräch, in sechs Wochen.',
          },
          {
            title: 'Beim Schreiben das Raster vor Augen',
            body: 'Das Antwortfeld zeigt die fünf Dimensionen mit ihrem Indikator. Die Buchstaben, die sich beim Schreiben hervorheben, sind eine Schreibhilfe, nicht deine Note: sie erkennen eine Zahl oder eine Zeitangabe, nicht ob die Frist Sinn ergibt.',
            tip: 'Vergleiche «ich will in Mathe besser werden» mit «von 70 auf 85 Punkte kommen, mit täglich 30 Minuten Übung über 6 Wochen». Das zweite ist nicht aus Schmuck länger: jeder Teil beantwortet eine Dimension.',
          },
          {
            title: 'Beim Korrigieren Dimension für Dimension',
            body: 'Unter «Korrigieren» erscheinen die fünf Dimensionen von 0 bis 4. Gesamtwert von 20, Stufe und Punkte der Frage rechnen sich von selbst, und gespeichert wird erst, wenn alle fünf da sind: ein halbes Raster würde in der Statistik ganz bewertete Ziele mit halben mischen.',
            tip: 'Null ist keine Strafe, sondern «das Kriterium fehlt». Ein Ziel ohne jedes Datum bekommt bei «terminiert» eine Null, auch wenn der Rest stimmt – und genau das soll man später sehen können.',
          },
          {
            title: 'Schau in die Aufschlüsselung',
            body: 'Der Schnitt jeder Dimension von 4 sagt, woran die Klasse scheitert. Fast immer sind es dieselben zwei: der messbare Indikator und die Frist. Mit der Note von 20 allein wüsste man nur, dass es mittelmäßig läuft; mit der Aufschlüsselung weiß man, was neu zu erklären ist.',
          },
        ],
        faq: [
          {
            question: 'Warum 0–20 und nicht die Schulskala?',
            answer:
              'Weil sie Verschiedenes messen. Das Raster bewertet diese Frage von 20, und diese Punkte gehen wie bei jeder anderen Frage in die Prüfung ein; die Endnote kommt weiter auf der deutschen Skala heraus. Zwei Skalen für zwei Dinge, nicht zwei Noten für dasselbe.',
          },
          {
            question: 'Kann ich Dimensionen oder Stufen ändern?',
            answer:
              'Nein, und das mit Absicht. Würde jede Lehrkraft das Raster neu definieren, ließe sich der Schnitt von «terminiert» einer Klasse nicht mit dem einer anderen vergleichen und die Statistik nach Dimension wäre nutzlos. Was du bestimmst, ist der Rahmen – im Aufgabentext.',
          },
        ],
      },

      {
        id: 'recomendaciones',
        title: 'Empfehlungen',
        audience: 'all',
        lead: 'Nichts davon ist Pflicht, aber es verhindert die meisten Probleme, die wir gesehen haben.',
        steps: [
          {
            title: 'Wirklich eine Kompetenz pro Frage',
            body: 'Wenn du beim Etikettieren zwischen zwei Kompetenzen schwankst, misst die Frage wahrscheinlich zwei Dinge. Teile sie. Eine Frage, die zwei Dinge misst, verrät nicht, welches fehlschlug.',
          },
          {
            title: 'Prüfe übers Jahr alle sechs Kompetenzen',
            body: 'Leicht landet man nur bei «Suchen» und «Produzieren», weil die sich von selbst ergeben. Das KMK-Radar zeigt die Nullen genau deshalb an.',
          },
          {
            title: 'Die Rückmeldung ist der lehrende Teil',
            body: '«Gut gemacht!» bringt nichts. Zu erklären, warum die richtige Option richtig ist und wohin man bei einem Fehler schauen sollte, macht aus einer Prüfung eine Unterrichtsstunde.',
          },
          {
            title: 'Teste auf dem Tablet vor einer Tablet-Prüfung',
            body: 'Zehn Minuten Vorschau auf demselben Gerät wie die Klasse verhindern die meisten Überraschungen am Prüfungstag.',
          },
          {
            title: 'Verlange Nachweise nicht vorsorglich',
            body: 'Jede hochgeladene Datei ist Speicher, den jemand irgendwann prüfen und löschen muss – und es sind Arbeiten Minderjähriger. Verlange sie, wenn du sie ansehen wirst.',
          },
        ],
      },
    ],
  },
};
