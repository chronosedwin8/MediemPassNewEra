import type { PublicContent } from './types';

/** Homepage and wiki content in English. */
export const en: PublicContent = {
  home: {
    hero: {
      eyebrow: 'German School of Barranquilla',
      title: 'Medienpass',
      lead: 'Assessing digital competence, not just using digital tools.',
      body: 'Almost every lesson now involves digital media. Very few can say which specific digital competence a student practised on Tuesday, or how that changed over the year. Medienpass closes that gap: every question on the platform declares the KMK competence it measures, and from that a picture of progress emerges — per student, per class and per competence.',
    },

    why: {
      title: 'Why digital media must be assessed, not merely used',
      lead: 'Bringing technology into a classroom is easy. Knowing whether it teaches anything is a different matter — and without the second, the first is decoration.',
      points: [
        {
          tag: 'The problem',
          title: 'Using is not understanding',
          body: 'A student who copies the first search result has used a digital tool and demonstrated no competence at all. You cannot see the difference by looking over their shoulder: you have to ask, and ask in a way that separates repeating from verifying.',
        },
        {
          tag: 'The consequence',
          title: 'What is not measured is assumed',
          body: 'Without data every teacher forms a private impression of where their class stands on digital competence, and those impressions cannot be added up or compared. The result is a school that invests in technology and cannot say what it got back.',
        },
        {
          tag: 'The approach',
          title: 'One competence per question',
          body: 'No question exists here without declaring which KMK competence it exercises. That is not paperwork: it turns an assessment into a value comparable across subjects, classes and years — and it is what lets a school discover that its year 10 problem is not "digital skills" but specifically evaluating sources.',
        },
        {
          tag: 'The limit',
          title: 'Data points, it does not decide',
          body: 'A percentage tells you where to look, not what to do. The platform never grades what a teacher must read, never publishes anything unreviewed, and never reduces a person to a number: every result arrives with its competence breakdown and the feedback that explains it.',
        },
      ],
    },

    frameworks: {
      title: 'Three frameworks, one job',
      lead: 'The school works within three reference systems that are usually presented separately: the KMK framework, the ISTE standards and IB education. They do not compete. They describe the same competence from three angles — what you can do, how it is taught, and what kind of person is formed along the way.',

      kmk: {
        name: 'KMK framework',
        subtitle: 'Education in the digital world',
        intro:
          'Six competences agreed by the German Standing Conference of Ministers of Education for the whole school system. It is the framework Medienpass measures: every question names one, and all statistics aggregate by it.',
        items: [
          {
            tag: 'KMK 1',
            title: 'Searching, processing and storing',
            body: 'Framing the question before searching, narrowing sensibly, checking who stands behind what appears, and storing it so it can be found and cited again.',
          },
          {
            tag: 'KMK 2',
            title: 'Communicating and collaborating',
            body: 'Working with others in shared tools, agreeing on rules of conduct, and knowing how to intervene when something goes wrong.',
          },
          {
            tag: 'KMK 3',
            title: 'Producing and presenting',
            body: 'Moving from collage to authorship: choosing the format that fits what you want to say, and respecting copyright.',
          },
          {
            tag: 'KMK 4',
            title: 'Protecting and acting safely',
            body: 'Protecting personal data, recognising deception and knowing what to do next; treating safety as a practice rather than a setting.',
          },
          {
            tag: 'KMK 5',
            title: 'Problem solving and acting',
            body: 'Choosing the right tool, coping when it fails, and understanding enough of how it works not to depend on someone else.',
          },
          {
            tag: 'KMK 6',
            title: 'Analysing and reflecting',
            body: 'Seeing the medium and not only the message: who produced it, with what intent, what is left out and what effect that has.',
          },
        ],
        source: {
          label: 'KMK strategy (PDF, German)',
          url: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2021/2021_12_09-Lehren-und-Lernen-Digi.pdf',
        },
      },

      isteStudents: {
        name: 'ISTE · Students',
        subtitle: 'Seven learning roles',
        intro:
          'Where KMK describes competences, ISTE describes roles a learner takes on. That helps when designing tasks: it says what students should be doing, not only what they should know.',
        items: [
          {
            tag: '1.1',
            title: 'Empowered Learner',
            body: 'Takes an active part in setting their own learning goals and evidencing them.',
          },
          {
            tag: '1.2',
            title: 'Digital Citizen',
            body: 'Manages their digital identity, acts safely and ethically, respects intellectual property.',
          },
          {
            tag: '1.3',
            title: 'Knowledge Constructor',
            body: 'Builds knowledge from sources they were able to find and evaluate.',
          },
          {
            tag: '1.4',
            title: 'Innovative Designer',
            body: 'Designs solutions to real problems and tolerates a first attempt that fails.',
          },
          {
            tag: '1.5',
            title: 'Computational Thinker',
            body: 'Breaks problems down, recognises patterns and tests assumptions with data.',
          },
          {
            tag: '1.6',
            title: 'Creative Communicator',
            body: 'Chooses medium and format according to the audience.',
          },
          {
            tag: '1.7',
            title: 'Global Collaborator',
            body: 'Widens their perspective by working with people from other contexts.',
          },
        ],
        source: {
          label: 'ISTE Standards for Students',
          url: 'https://iste.org/standards/students',
        },
      },

      isteEducators: {
        name: 'ISTE · Educators',
        subtitle: 'Seven professional roles',
        intro:
          'The counterpart of the previous framework. It describes what the teacher does so that the above can happen, and it is the reference behind this platform’s training modules.',
        items: [
          {
            tag: '2.1',
            title: 'Learner',
            body: 'Keeps learning: sets their own goals and compares practice with colleagues.',
          },
          {
            tag: '2.2',
            title: 'Leader',
            body: 'Advances a shared vision of learning with technology across the school.',
          },
          {
            tag: '2.3',
            title: 'Citizen',
            body: 'Models responsible digital participation and teaches it by example.',
          },
          {
            tag: '2.4',
            title: 'Collaborator',
            body: 'Makes time to work with colleagues and with students.',
          },
          {
            tag: '2.5',
            title: 'Designer',
            body: 'Designs authentic tasks that acknowledge differences between learners.',
          },
          {
            tag: '2.6',
            title: 'Facilitator',
            body: 'Facilitates learning with technology rather than replacing it with technology.',
          },
          {
            tag: '2.7',
            title: 'Analyst',
            body: 'Uses data to understand progress and adjust teaching. This is exactly the role the Medienpass statistics serve.',
          },
        ],
        source: {
          label: 'ISTE Standards for Educators',
          url: 'https://iste.org/standards/educators',
        },
      },

      ib: {
        name: 'IB learner profile',
        subtitle: 'Ten attributes, four programmes',
        intro:
          'The IB does not describe digital competences; it describes the kind of person being educated. That is why it does not compete with the other two frameworks — it gives them their purpose. A competence without the disposition that carries it is a skill without a standard.',
        items: [
          {
            tag: 'Inquirers',
            title: 'Inquirers',
            body: 'Cultivate curiosity and can conduct research on their own.',
          },
          {
            tag: 'Knowledgeable',
            title: 'Knowledgeable',
            body: 'Explore ideas of local and global significance.',
          },
          {
            tag: 'Thinkers',
            title: 'Thinkers',
            body: 'Analyse critically and make reasoned, ethical decisions.',
          },
          {
            tag: 'Communicators',
            title: 'Communicators',
            body: 'Express themselves clearly and listen to other points of view.',
          },
          {
            tag: 'Principled',
            title: 'Principled',
            body: 'Act with honesty and take responsibility for the consequences.',
          },
          {
            tag: 'Open-minded',
            title: 'Open-minded',
            body: 'Value their own culture and are open to others.',
          },
          { tag: 'Caring', title: 'Caring', body: 'Show empathy and commit themselves to others.' },
          {
            tag: 'Risk-takers',
            title: 'Risk-takers',
            body: 'Face the unfamiliar thoughtfully and without fear of getting it wrong.',
          },
          {
            tag: 'Balanced',
            title: 'Balanced',
            body: 'Attend to the balance between mind, body and emotion.',
          },
          {
            tag: 'Reflective',
            title: 'Reflective',
            body: 'Assess their own learning and recognise their limits.',
          },
        ],
        source: {
          label: 'IB learner profile (PDF)',
          url: 'https://www.ibo.org/globalassets/new-structure/digital-toolkit/pdfs/learner-profile-2017-en.pdf',
        },
      },
    },

    crosswalk: {
      title: 'Where the three frameworks overlap',
      lead: 'The table does not claim exact equivalences. It shows that a well-designed digital task serves all three frameworks at once, even when you were only thinking about one of them.',
      caveat:
        'These correspondences are indicative and are drawn by the school, not by the organisations that publish the frameworks. None of the three defines itself in terms of the others.',
      columns: {
        kmk: 'KMK competence',
        iste: 'ISTE (student / educator)',
        ib: 'IB learner profile',
        practice: 'What it looks like in class',
      },
      rows: [
        {
          kmk: '1 · Searching, processing, storing',
          iste: 'Knowledge Constructor / Facilitator',
          ib: 'Inquirers, Thinkers',
          practice:
            'Find a contested claim and three sources about it, then work out whether they are independent or copying each other.',
        },
        {
          kmk: '2 · Communicating and collaborating',
          iste: 'Global Collaborator / Collaborator',
          ib: 'Communicators, Open-minded',
          practice:
            'A shared document with rules agreed in advance, where the version history forms part of the assessment.',
        },
        {
          kmk: '3 · Producing and presenting',
          iste: 'Creative Communicator / Designer',
          ib: 'Risk-takers, Communicators',
          practice:
            'Record a two-minute explainer video and credit the source of every image used.',
        },
        {
          kmk: '4 · Protecting and acting safely',
          iste: 'Digital Citizen / Citizen',
          ib: 'Principled, Caring',
          practice:
            'Analyse a real case of identity misuse and decide, step by step, what the class would do.',
        },
        {
          kmk: '5 · Problem solving and acting',
          iste: 'Computational Thinker / Analyst',
          ib: 'Thinkers, Risk-takers',
          practice:
            'A tool fails: document what was tried, in what order, and what finally worked.',
        },
        {
          kmk: '6 · Analysing and reflecting',
          iste: 'Empowered Learner / Leader',
          ib: 'Reflective, Balanced',
          practice:
            'Compare how three outlets tell the same event and explain what each omits and who benefits.',
        },
      ],
    },

    ibLevels: {
      title: 'At every IB level',
      lead: 'The learner profile attributes are the same from age four to eighteen; what changes is what it means to live them. Digital competence follows that same path instead of appearing suddenly in secondary school.',
      levels: [
        {
          tag: 'PYP',
          title: 'Primary Years Programme',
          body: 'Inquiry starts before fluent reading does. Digital competence here is mostly habit: asking where an image came from, understanding that what is published stays, and beginning to produce rather than only consume.',
        },
        {
          tag: 'MYP',
          title: 'Middle Years Programme',
          body: 'Judgement enters. It is no longer just searching: sources are compared, intent is identified, and the consequences of sharing are owned. This is the stage where the six KMK competences can be assessed most clearly.',
        },
        {
          tag: 'DP',
          title: 'Diploma Programme',
          body: 'The demand becomes academic. Citing properly stops being a school rule and becomes intellectual honesty; the Extended Essay and Theory of Knowledge assess precisely what competences 1 and 6 measure.',
        },
        {
          tag: 'CP',
          title: 'Career-related Programme',
          body: 'The horizon is working life, where digital competence is judged by what you can do rather than what you studied. Producing, collaborating and problem solving weigh more than memorising.',
        },
      ],
    },

    access: {
      title: 'Entering the platform',
      lead: 'Everyone signs in the same way, with their school email. What differs is what waits inside. If you are not sure, just sign in — the platform will take you where you belong.',
      roles: [
        {
          key: 'student',
          title: 'Students',
          body: 'Your email is your four-digit code followed by @colegioaleman.edu.co. If you do not have a password yet, the school issues it.',
          bullets: [
            'See and take the assessments assigned to you',
            'Resume an attempt already started without losing anything',
            'Review your grade, competence breakdown and feedback',
          ],
        },
        {
          key: 'teacher',
          title: 'Teachers',
          body: 'With your school email. Sign in with a password or, if enabled, with the school Microsoft account.',
          bullets: [
            'Create assessments — with AI if you want — and preview them before publishing',
            'Assign them to groups and grade open answers',
            'Review results per class and complete your own training',
          ],
        },
        {
          key: 'admin',
          title: 'Administration',
          body: 'For coordination: academic structure, permissions and training content.',
          bullets: [
            'Sync enrolment with Phidias and open the school year',
            'Write and publish training material',
            'Manage role permissions, AI and stored files',
          ],
        },
      ],
    },
  },

  wiki: {
    title: 'How to use Medienpass',
    lead: 'A guide organised by task rather than by screen: what you want to do and how to do it. It is written so it can be read before signing in for the first time.',
    audiences: {
      all: 'Everyone',
      teacher: 'Teachers',
      student: 'Students',
      admin: 'Administration',
    },
    sections: [
      {
        id: 'acceso',
        title: 'Signing in for the first time',
        audience: 'all',
        lead: 'Everyone signs in at the same place. What differs afterwards is the menu on the left, which depends on what your account is allowed to do.',
        steps: [
          {
            title: 'Use your school email',
            body: 'For students that is the four-digit code plus @colegioaleman.edu.co. For teachers, the usual school address.',
            tip: 'If your credentials are rejected and the email is definitely right, your account may not have a password yet. That is resolved by administration, not by changing your password.',
          },
          {
            title: 'Change the temporary password',
            body: 'Passwords issued by the school are read aloud or printed on lists. The platform requires you to change it before anything else, and that is not bureaucracy: that password has been in other hands.',
          },
          {
            title: 'Choose your language',
            body: 'Top right. The interface exists in Spanish, German and English, and your choice is remembered. The language of the content depends on whoever wrote it.',
          },
        ],
        screen: {
          title: 'Sign-in screen',
          caption: 'The same one for students, teachers and administration.',
          regions: [
            { label: 'School email', note: 'code@colegioaleman.edu.co', emphasis: true },
            { label: 'Password', note: 'The temporary one expires on first use' },
            { label: 'Sign in', note: 'Primary button', emphasis: true },
            { label: 'Sign in with Microsoft', note: 'If the school has enabled it' },
            { label: 'Language', note: 'Español · Deutsch · English' },
          ],
        },
        faq: [
          {
            question: 'Does it work on a phone?',
            answer:
              'Yes. The platform is designed for small screens, and the assessment view in particular is tested on tablets — the most common device in class.',
          },
          {
            question: 'I forgot my password.',
            answer:
              'Ask administration. There is deliberately no automatic email recovery: many students share a device, and a reset link in a shared inbox is a shared account.',
          },
        ],
      },

      {
        id: 'estudiante-evaluacion',
        title: 'Taking an assessment',
        audience: 'student',
        lead: 'Everything you write is saved as you write it. You never have to press "save".',
        steps: [
          {
            title: 'Open "My assessments"',
            body: 'It lists what has been assigned to you and what you have already submitted. Each one shows the attempts you have left and how long it stays open.',
          },
          {
            title: 'Answer in any order',
            body: 'The navigator at the bottom lets you jump around. Answered questions are marked, and so are the ones you left blank.',
            tip: 'If your browser closes or the connection drops, sign in again and carry on. The attempt is waiting with everything you had written.',
          },
          {
            title: 'Save and continue later, when the assessment allows it',
            body: 'When an assessment has no time limit, it says so at the top and "Save and continue later" appears at the bottom. You can close it and come back whenever you like: the attempt waits with everything you wrote.',
            tip: 'If the assessment is timed, that button is not there and you see the clock instead. The limit runs from the moment you open it even if you close the page, so it is best finished in one sitting.',
          },
          {
            title: 'Attach evidence when asked',
            body: 'Some questions let you attach a photo, a document or audio. When evidence is required, the question says so and you cannot submit without it.',
            tip: 'Upload the file as soon as you have it, not at the end. Five uploads in the final minute compete for the same school connection.',
          },
          {
            title: 'Submit when you are sure',
            body: 'Submitting saves anything pending and closes the attempt. It cannot be undone.',
          },
        ],
        screen: {
          title: 'During an assessment',
          caption: 'Time is kept by the server: reloading does not reset it.',
          regions: [
            { label: 'Header', note: 'Title, time remaining and save status' },
            {
              label: 'Question',
              note: 'With formatting, images and the KMK competence it measures',
            },
            { label: 'Your answer', note: 'Saves as you type', emphasis: true },
            { label: 'Evidence', note: 'Only if the question allows it' },
            { label: 'Question navigator', note: 'Answered, pending and current', emphasis: true },
          ],
        },
        faq: [
          {
            question: 'What happens if time runs out while I am writing?',
            answer:
              'The attempt closes with whatever was saved. Time is controlled by the server and the clock on your screen is informational only: reloading buys no minutes.',
          },
          {
            question: 'I can see my grade but I do not understand it.',
            answer:
              'Below the grade is the breakdown by KMK competence and the feedback for each question. If there were open answers, the grade may still change once your teacher finishes marking.',
          },
        ],
      },

      {
        id: 'estudiante-resultados',
        title: 'Understanding your result',
        audience: 'student',
        lead: 'Grades follow the German scale: 1.0 is the best result and 6.0 the worst. Stars accompany the number, they do not replace it.',
        steps: [
          {
            title: 'Look at the breakdown first',
            body: 'The overall figure says how it went; the breakdown says in what. Failing "evaluating sources" is not the same as failing "producing and presenting", and studying more of the same helps with neither.',
          },
          {
            title: 'Be careful with the stars',
            body: 'Five stars mean 1.0, the best grade. That is the opposite of a shopping site, which is why the platform never shows them alone: always with the number and the word.',
          },
          {
            title: 'Check your dashboard for the whole picture',
            body: 'The home screen gathers everything of yours: how many assessments you have done and how many are left, your grade average, how long they take you on average, and where you stand in your class.',
            tip: 'The position is based on your average across all assessments and only among classmates who already have a result. "Position 6 of 6" in a class of thirty-two does not mean you are last: it means only six have submitted anything yet.',
          },
          {
            title: 'Read the feedback',
            body: 'Each question explains why the correct answer is correct. That is the part that actually teaches something; the grade only summarises.',
          },
        ],
      },

      {
        id: 'docente-crear',
        title: 'Creating and publishing an assessment',
        audience: 'teacher',
        lead: 'An assessment has versions. While it is a draft everything can change; once published it is frozen — and that is exactly what makes a March result still mean the same thing in November.',
        steps: [
          {
            title: 'Create the assessment',
            body: 'Title, subject, year group and language. It is born with its first version as a draft.',
          },
          {
            title: 'Add questions',
            body: 'Thirteen types, from single choice to ordering, matching or marking regions on an image. Every question must state which KMK competence it exercises.',
            tip: 'That declaration carries everything else. A carelessly labelled question distorts the statistics of the whole class, and nobody notices until the numbers stop making sense.',
          },
          {
            title: 'Decide about evidence',
            body: 'Per question you can allow attachments and make them required to submit. It is off by default: demanding a file nobody needs is friction for students and storage somebody will have to delete.',
          },
          {
            title: 'Preview before publishing',
            body: '"Preview" shows the assessment exactly as the class will see it, and you can answer it as a test without anything being saved. "Show solutions" additionally lets you check that the marked answer is the right one.',
            tip: 'With AI-generated questions this step is not optional. A question can be impeccably written and have the wrong option marked as correct; no automatic check catches that, a person does.',
          },
          {
            title: 'Decide whether it is timed, and with that whether it can be paused',
            body: 'In the version settings you can set a duration in minutes. Zero means no limit. The two go together: with no time limit students can save and continue later; with one they cannot, because the clock runs from the moment they open the attempt even with the page closed.',
            tip: 'Set a time when speed is part of what you are assessing. If what you want is for them to search, compare and write carefully, leaving it open measures that better.',
          },
          {
            title: 'Turn on the certificate if you want to certify',
            body: 'With the certificate on, anyone who passes can download a PDF certifying the KMK competences they demonstrated. You can switch it on even after publishing, which is usually when it occurs to you.',
            tip: 'Only competences scoring at least 70% on the questions that measure them are certified, and the document states how many were assessed without reaching it. A certificate that claimed more would be worth nothing.',
          },
          {
            title: 'Publish and assign',
            body: 'Publishing makes the version immutable. After that you assign it to one of your groups, with a window and a number of attempts.',
            tip: 'You can only assign to groups you lead. An empty group list is not a bug: you are not registered as homeroom teacher anywhere, and administration resolves that.',
          },
          {
            title: 'Ask for a photo, a video or a voice note when it helps',
            body: 'Three question types are answered by recording: a selfie, a video of up to three minutes and a voice note of up to five. They are for what text does not show: that someone can explain out loud what they understood, or that the build they are describing actually exists.',
            tip: 'Camera and microphone only work over HTTPS or on the computer itself. If you plan to use them in class over the network address, tell whoever is serving the platform beforehand or there will be no camera on the day.',
          },
          {
            title: 'Grade what the machine cannot',
            body: 'Open and recorded answers stay pending review. "Marking" lists them all together, oldest first, with the video or audio ready to play right there: you enter the mark and a comment without opening each attempt.',
          },
        ],
        screen: {
          title: 'Assessment detail',
          caption: 'In draft the editing actions appear; once published, the usage ones.',
          regions: [
            { label: 'Header', note: 'Title, status, version, questions and points' },
            {
              label: 'Actions',
              note: 'Preview · Edit · Publish · Assign · Results',
              emphasis: true,
            },
            { label: 'Question list', note: 'With KMK competence and points' },
            { label: 'Question editor', note: 'Rich text, image and evidence', emphasis: true },
            { label: 'Version history', note: 'What was published and when' },
          ],
        },
        faq: [
          {
            question: 'There is a mistake in a published question.',
            answer:
              'Create a new version: it copies the questions and lets you correct them. Attempts already taken keep pointing at their own version, so no grade already given changes.',
          },
          {
            question: 'Can I delete an assessment that has grades?',
            answer:
              'Only administration, and only by typing the title. Before that the platform shows how many attempts by how many students will be destroyed. There is no way back.',
          },
        ],
      },

      {
        id: 'docente-ia',
        title: 'Generating questions with AI',
        audience: 'teacher',
        lead: 'The AI proposes, you decide. Everything it generates arrives as a draft and reaches nobody until you read it and publish.',
        steps: [
          {
            title: 'Describe the topic',
            body: 'One short sentence. "The water cycle", "Checking sources on the internet".',
          },
          {
            title: 'Write the context — this is what matters',
            body: 'What you covered in class, which tools you use, which vocabulary to use and what to avoid. This is the difference between a generic assessment and one that fits your group.',
            tip: 'A real example: "Year 6. We covered evaporation and condensation with a glass-and-ice experiment. We have not done infiltration. Avoid snow examples: it does not snow here." The model used the experiment in one question and never mentioned snow.',
          },
          {
            title: 'Choose competences and types',
            body: 'At least one KMK competence. Only the types the model generates well are offered: none that require coordinates on an image it has not seen.',
          },
          {
            title: 'Review the draft',
            body: 'Open the preview with solutions visible and read it. Any question without a correct answer marked is highlighted in red.',
          },
        ],
        faq: [
          {
            question: 'The generated questions had nothing to do with the topic.',
            answer:
              'Then the platform is running in simulated mode without an API key. In that mode it produces placeholders with the right structure and no real content. The form warns you before you generate.',
          },
          {
            question: 'How long does it take?',
            answer:
              'About 25 seconds for five questions and up to a minute and a half for thirty. Do not close the page while it is working.',
          },
        ],
      },

      {
        id: 'docente-resultados',
        title: 'Reading a group’s results',
        audience: 'teacher',
        lead: 'There are two views for two questions: "how is the class doing overall" and "how did this particular assessment go".',
        steps: [
          {
            title: 'Check how many started first',
            body: 'Group results show "not started" before the average. A 40 % average with half the class never starting says nothing about your teaching.',
          },
          {
            title: 'Compare the shape, not only the average',
            body: 'The distribution by grade band shows whether the group is homogeneous or split in two. The same average can call for very different teaching decisions.',
          },
          {
            title: 'Look at the most-missed questions',
            body: 'Ordered by observed difficulty, not by the difficulty declared when writing them. When the two disagree, the wording is usually the reason.',
          },
          {
            title: 'Start from your dashboard',
            body: 'The home screen brings together what you have created, how many people it reached, what is still unstarted and what you have left to mark. The "competences covered" figure is the one that changes practice most: it shows at a glance whether you have spent the year measuring only two of the six.',
            tip: 'At the end sits your own KMK training, deliberately separate from the rest. A class average can mean many things, and almost none of them is a judgement about the teacher.',
          },
          {
            title: 'Go into the breakdown when the average is not enough',
            body: 'Under Statistics, the breakdown by competence shows the same figure by subject, by class or student by student. That is where you see the class problem is not "digital skills" but specifically competence 6, or that two students have not engaged for months while the average covers for them.',
            tip: 'Filter by class first, then view by student: the table becomes your class list. "Not measured" is not a zero — it means that competence has not been assessed there yet.',
          },
          {
            title: 'Use the KMK radar to decide',
            body: 'Competences never measured show as zero and do not disappear from the chart, so it becomes obvious when "analysing and reflecting" went unassessed all year.',
          },
        ],
      },

      {
        id: 'docente-capacitacion',
        title: 'Your own KMK training',
        audience: 'teacher',
        lead: 'Six modules, one per competence, with material and a final assessment. That assessment uses the same engine as the students’, so you experience exactly what they will.',
        steps: [
          {
            title: 'Work through the material',
            body: 'Each block you open counts as seen. There are texts, activities and vetted external resources: the KMK strategy, the NRW media competence framework, klicksafe, Internet-ABC, INTEF and Common Sense.',
          },
          {
            title: 'Take the module assessment',
            body: 'Five attempts. The pass mark for teachers is 80 %, stricter than the 70 % for students, and it is stated up front.',
          },
          {
            title: 'Get certified',
            body: 'Working through the material does not certify you; passing the assessment does. That distinction is deliberate.',
          },
        ],
      },

      {
        id: 'admin-contenido',
        title: 'Writing training material',
        audience: 'admin',
        lead: 'Material is written in blocks within each module. Nothing is visible until it is published.',
        steps: [
          {
            title: 'Create the module',
            body: 'A short stable code, a KMK competence, title and description. It starts as a draft.',
          },
          {
            title: 'Add blocks',
            body: 'Text, video, document, link or activity. Each with a title, rich text and attachments if needed.',
            tip: 'Several short blocks work better than one long one: teachers open them one at a time and progress is measured by that. A ten-page block turns progress into a switch.',
          },
          {
            title: 'Tell an image from an attachment',
            body: 'The image that illustrates a paragraph is inserted into the text, from the toolbar. The PDF to be downloaded is an attachment. Two different things with two different behaviours.',
          },
          {
            title: 'Publish',
            body: 'A module with no material cannot be published. Afterwards you can unpublish or archive it; archiving preserves the progress of those who already completed it.',
          },
        ],
        screen: {
          title: 'Module editor',
          caption: 'Blocks are reordered with arrows and expanded to edit.',
          regions: [
            { label: 'Header', note: 'Status, code and publishing actions', emphasis: true },
            { label: 'Module data', note: 'Title and description in three languages' },
            { label: 'Blocks', note: 'Collapsed; open them one at a time to edit', emphasis: true },
            { label: 'Block editor', note: 'Rich text, images, link and attachments' },
            { label: 'Linked assessment', note: 'The one that certifies the module' },
          ],
        },
      },

      {
        id: 'admin-plataforma',
        title: 'Administering the platform',
        audience: 'admin',
        lead: 'Four areas: role permissions, settings, school year and files. These are infrequent operations with wide reach, and the interface is built so they are done deliberately rather than quickly.',
        steps: [
          {
            title: 'Role permissions',
            body: 'What each role can do, editable without a deployment. The administrator role is locked: if permissions could be taken away from it, one mistake would leave nobody able to give them back.',
          },
          {
            title: 'Sync with Phidias',
            body: 'Brings in the real enrolment. Each student’s email is derived from their code; the personal address Phidias sometimes carries is the family contact and is not used as an identity.',
          },
          {
            title: 'Open the school year',
            body: 'Creates the new year and replicates the groups empty; enrolment then arrives from Phidias. The previous year stays untouched with all its grades.',
            tip: 'Deleting the outgoing year’s evidence is off by default. The previous year keeps its grades, and a grade referring to evidence that no longer exists is one nobody can justify later.',
          },
          {
            title: 'Stored files',
            body: 'What exists, how much space it takes and by year. To delete: choose the scope, simulate, review, confirm. What is deleted has no copy.',
          },
        ],
      },

      {
        id: 'recomendaciones',
        title: 'Recommendations',
        audience: 'all',
        lead: 'None of this is compulsory, but it prevents most of the problems we have seen.',
        steps: [
          {
            title: 'Really one competence per question',
            body: 'If you hesitate between two competences when labelling, the question probably measures two things. Split it. A question that measures two things does not tell you which one failed.',
          },
          {
            title: 'Assess all six competences across the year',
            body: 'It is easy to end up only with "searching" and "producing" because they come up naturally. That is precisely why the KMK radar shows the zeros.',
          },
          {
            title: 'Feedback is the part that teaches',
            body: '"Well done!" contributes nothing. Explaining why the correct option is correct, and where to look if you got it wrong, turns an assessment into a lesson.',
          },
          {
            title: 'Test on a tablet before assessing on tablets',
            body: 'Ten minutes of preview on the same device the class will use prevents most surprises on the day.',
          },
          {
            title: 'Do not request evidence just in case',
            body: 'Every uploaded file is storage somebody will eventually have to review and delete — and it is work produced by minors. Ask for it when you are going to look at it.',
          },
        ],
      },
    ],
  },
};
