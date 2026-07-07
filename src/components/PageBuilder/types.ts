// Page Builder Types
export type ElementType = 
  | 'hero'
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'spacer'
  | 'divider'
  | 'card'
  | 'feature-grid'
  | 'testimonial'
  | 'contact-info'
  | 'logo'
  | 'progress-stepper'
  | 'choice-buttons'
  | 'category-grid'
  | 'treatment-list'
  | 'booking-form'
  | 'time-slots'
  | 'confirmation-summary'
  | 'success-message';

// Booking Flow Page IDs
export type BookingPageId = 
  | 'landing'
  | 'first-visit'
  | 'category-selection'
  | 'treatment-selection'
  | 'doctor-selection'
  | 'booking-form'
  | 'confirmation'
  | 'success';

export interface BaseElement {
  id: string;
  type: ElementType;
  locked?: boolean;
}

export interface HeroElement extends BaseElement {
  type: 'hero';
  props: {
    title: { en: string; fr: string };
    subtitle: { en: string; fr: string };
    backgroundImage?: string;
    backgroundColor?: string;
    alignment: 'left' | 'center' | 'right';
    showLogo?: boolean;
    logoUrl?: string;
  };
}

export interface HeadingElement extends BaseElement {
  type: 'heading';
  props: {
    text: { en: string; fr: string };
    level: 'h1' | 'h2' | 'h3' | 'h4';
    alignment: 'left' | 'center' | 'right';
    color?: string;
  };
}

export interface TextElement extends BaseElement {
  type: 'text';
  props: {
    content: { en: string; fr: string };
    alignment: 'left' | 'center' | 'right';
    fontSize: 'sm' | 'base' | 'lg' | 'xl';
    color?: string;
  };
}

export interface ImageElement extends BaseElement {
  type: 'image';
  props: {
    src: string;
    alt: { en: string; fr: string };
    width?: number;
    height?: number;
    rounded?: boolean;
    shadow?: boolean;
  };
}

export interface ButtonElement extends BaseElement {
  type: 'button';
  props: {
    text: { en: string; fr: string };
    href: string;
    variant: 'primary' | 'secondary' | 'outline';
    size: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    icon?: 'calendar' | 'arrow-right' | 'phone' | 'email' | 'none';
  };
}

export interface SpacerElement extends BaseElement {
  type: 'spacer';
  props: {
    height: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  };
}

export interface DividerElement extends BaseElement {
  type: 'divider';
  props: {
    style: 'solid' | 'dashed' | 'dotted';
    color?: string;
    width?: 'full' | 'half' | 'quarter';
  };
}

export interface CardElement extends BaseElement {
  type: 'card';
  props: {
    title: { en: string; fr: string };
    description: { en: string; fr: string };
    image?: string;
    icon?: string;
    link?: string;
    variant: 'default' | 'bordered' | 'elevated';
  };
}

export interface FeatureGridElement extends BaseElement {
  type: 'feature-grid';
  props: {
    columns: 2 | 3 | 4;
    items: Array<{
      id: string;
      icon: string;
      title: { en: string; fr: string };
      description: { en: string; fr: string };
    }>;
  };
}

export interface TestimonialElement extends BaseElement {
  type: 'testimonial';
  props: {
    quote: { en: string; fr: string };
    author: string;
    role: { en: string; fr: string };
    avatar?: string;
  };
}

export interface ContactInfoElement extends BaseElement {
  type: 'contact-info';
  props: {
    showPhone?: boolean;
    showEmail?: boolean;
    showAddress?: boolean;
    showHours?: boolean;
    phone?: string;
    email?: string;
    address?: { en: string; fr: string };
    hours?: { en: string; fr: string };
  };
}

export interface LogoElement extends BaseElement {
  type: 'logo';
  props: {
    src: string;
    alt: string;
    width: number;
    height: number;
    alignment: 'left' | 'center' | 'right';
  };
}

// Booking Flow Specific Elements
export interface ProgressStepperElement extends BaseElement {
  type: 'progress-stepper';
  props: {
    currentStep: number;
    totalSteps: number;
    showLabels?: boolean;
    labels?: Array<{ en: string; fr: string }>;
  };
}

export interface ChoiceButtonsElement extends BaseElement {
  type: 'choice-buttons';
  props: {
    choices: Array<{
      id: string;
      label: { en: string; fr: string };
      description?: { en: string; fr: string };
      icon?: 'check' | 'user' | 'calendar' | 'star' | 'heart' | 'none';
      href: string;
      variant: 'primary' | 'secondary';
    }>;
    layout: 'horizontal' | 'vertical';
  };
}

export interface CategoryGridElement extends BaseElement {
  type: 'category-grid';
  props: {
    dynamicSource: 'new-patient' | 'existing-patient';
    columns: 2 | 3 | 4;
    showDescription?: boolean;
    cardStyle: 'minimal' | 'bordered' | 'elevated';
  };
}

export interface TreatmentListElement extends BaseElement {
  type: 'treatment-list';
  props: {
    dynamicSource: boolean;
    showDuration?: boolean;
    showPrice?: boolean;
    columns: 2 | 3 | 4;
    cardStyle: 'minimal' | 'bordered' | 'elevated';
  };
}

export interface BookingFormElement extends BaseElement {
  type: 'booking-form';
  props: {
    title: { en: string; fr: string };
    showTabs?: boolean;
    fields: Array<'firstName' | 'lastName' | 'email' | 'phone' | 'notes'>;
    requiredFields: Array<'firstName' | 'lastName' | 'email' | 'phone'>;
  };
}

export interface TimeSlotsElement extends BaseElement {
  type: 'time-slots';
  props: {
    title: { en: string; fr: string };
    subtitle?: { en: string; fr: string };
    showEarliestAvailable?: boolean;
  };
}

export interface ConfirmationSummaryElement extends BaseElement {
  type: 'confirmation-summary';
  props: {
    title: { en: string; fr: string };
    fields: Array<'name' | 'email' | 'phone' | 'doctor' | 'date' | 'time' | 'service' | 'location'>;
  };
}

export interface SuccessMessageElement extends BaseElement {
  type: 'success-message';
  props: {
    title: { en: string; fr: string };
    message: { en: string; fr: string };
    showIcon?: boolean;
    showDetails?: boolean;
    buttonText: { en: string; fr: string };
    buttonHref: string;
  };
}

export type PageElement = 
  | HeroElement
  | HeadingElement
  | TextElement
  | ImageElement
  | ButtonElement
  | SpacerElement
  | DividerElement
  | CardElement
  | FeatureGridElement
  | TestimonialElement
  | ContactInfoElement
  | LogoElement
  | ProgressStepperElement
  | ChoiceButtonsElement
  | CategoryGridElement
  | TreatmentListElement
  | BookingFormElement
  | TimeSlotsElement
  | ConfirmationSummaryElement
  | SuccessMessageElement;

export interface PageSection {
  id: string;
  name: string;
  elements: PageElement[];
  backgroundColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export interface PageConfig {
  id: BookingPageId;
  name: string;
  path: string;
  stepNumber?: number;
  sections: PageSection[];
  metadata: {
    title: { en: string; fr: string };
    description: { en: string; fr: string };
  };
  settings: {
    backgroundColor?: string;
    fontFamily?: string;
    showProgressStepper?: boolean;
    showBackButton?: boolean;
    backButtonHref?: string;
  };
}

export interface BookingFlowConfig {
  pages: Record<BookingPageId, PageConfig>;
  globalSettings: {
    logoUrl: string;
    primaryColor: string;
    fontFamily: string;
  };
}

export interface ElementTemplate {
  type: ElementType;
  label: string;
  icon: string;
  description: string;
  defaultProps: Partial<PageElement['props']>;
}

export const ELEMENT_TEMPLATES: ElementTemplate[] = [
  {
    type: 'hero',
    label: 'Hero Section',
    icon: 'Layout',
    description: 'Large header with title and subtitle',
    defaultProps: {
      title: { en: 'Welcome', fr: 'Bienvenue' },
      subtitle: { en: 'Description', fr: 'Description' },
      alignment: 'center',
      showLogo: true,
    },
  },
  {
    type: 'heading',
    label: 'Heading',
    icon: 'Type',
    description: 'Title or section header',
    defaultProps: {
      text: { en: 'Heading', fr: 'Titre' },
      level: 'h2',
      alignment: 'center',
    },
  },
  {
    type: 'text',
    label: 'Text Block',
    icon: 'AlignLeft',
    description: 'Paragraph of text',
    defaultProps: {
      content: { en: 'Your text here...', fr: 'Votre texte ici...' },
      alignment: 'center',
      fontSize: 'base',
    },
  },
  {
    type: 'image',
    label: 'Image',
    icon: 'Image',
    description: 'Upload or link an image',
    defaultProps: {
      src: '/logos/maisontoa-logo.png',
      alt: { en: 'Image', fr: 'Image' },
      rounded: false,
      shadow: false,
    },
  },
  {
    type: 'button',
    label: 'Button',
    icon: 'MousePointer',
    description: 'Call-to-action button',
    defaultProps: {
      text: { en: 'Click Here', fr: 'Cliquez ici' },
      href: '#',
      variant: 'primary',
      size: 'md',
      icon: 'none',
    },
  },
  {
    type: 'spacer',
    label: 'Spacer',
    icon: 'SeparatorHorizontal',
    description: 'Add vertical space',
    defaultProps: {
      height: 'md',
    },
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: 'Minus',
    description: 'Horizontal line separator',
    defaultProps: {
      style: 'solid',
      width: 'full',
    },
  },
  {
    type: 'card',
    label: 'Card',
    icon: 'Square',
    description: 'Content card with title',
    defaultProps: {
      title: { en: 'Card Title', fr: 'Titre de la carte' },
      description: { en: 'Card description', fr: 'Description de la carte' },
      variant: 'bordered',
    },
  },
  {
    type: 'feature-grid',
    label: 'Feature Grid',
    icon: 'Grid3x3',
    description: 'Grid of features with icons',
    defaultProps: {
      columns: 3,
      items: [],
    },
  },
  {
    type: 'logo',
    label: 'Logo',
    icon: 'Sparkles',
    description: 'Company logo',
    defaultProps: {
      src: '/logos/maisontoa-logo.png',
      alt: 'Maison Toa',
      width: 200,
      height: 60,
      alignment: 'center',
    },
  },
  // Booking Flow Elements
  {
    type: 'progress-stepper',
    label: 'Progress Stepper',
    icon: 'ListOrdered',
    description: 'Show booking progress steps',
    defaultProps: {
      currentStep: 1,
      totalSteps: 5,
      showLabels: false,
    },
  },
  {
    type: 'choice-buttons',
    label: 'Choice Buttons',
    icon: 'ToggleLeft',
    description: 'Yes/No or option buttons',
    defaultProps: {
      choices: [],
      layout: 'horizontal',
    },
  },
  {
    type: 'category-grid',
    label: 'Category Grid',
    icon: 'LayoutGrid',
    description: 'Dynamic category cards',
    defaultProps: {
      dynamicSource: 'new-patient',
      columns: 4,
      showDescription: false,
      cardStyle: 'bordered',
    },
  },
  {
    type: 'treatment-list',
    label: 'Treatment List',
    icon: 'List',
    description: 'Dynamic treatment cards',
    defaultProps: {
      dynamicSource: true,
      showDuration: true,
      showPrice: false,
      columns: 4,
      cardStyle: 'bordered',
    },
  },
  {
    type: 'booking-form',
    label: 'Booking Form',
    icon: 'FileText',
    description: 'Personal info form',
    defaultProps: {
      title: { en: 'Book an Appointment', fr: 'Prendre un rendez-vous' },
      showTabs: true,
      fields: ['firstName', 'lastName', 'email', 'phone', 'notes'],
      requiredFields: ['firstName', 'lastName', 'email'],
    },
  },
  {
    type: 'time-slots',
    label: 'Time Slots',
    icon: 'Clock',
    description: 'Date and time picker',
    defaultProps: {
      title: { en: 'Select Date & Time', fr: 'Sélectionner une date et un horaire' },
      subtitle: { en: 'Please select a date', fr: 'Veuillez sélectionner une date' },
      showEarliestAvailable: true,
    },
  },
  {
    type: 'confirmation-summary',
    label: 'Confirmation Summary',
    icon: 'ClipboardCheck',
    description: 'Booking summary before confirming',
    defaultProps: {
      title: { en: 'Confirm Your Appointment', fr: 'Confirmer votre rendez-vous' },
      fields: ['name', 'email', 'phone', 'doctor', 'date', 'time', 'service', 'location'],
    },
  },
  {
    type: 'success-message',
    label: 'Success Message',
    icon: 'CheckCircle',
    description: 'Booking confirmation success',
    defaultProps: {
      title: { en: 'Appointment Booked!', fr: 'Rendez-vous confirmé!' },
      message: { en: 'Your appointment has been confirmed.', fr: 'Votre rendez-vous a été confirmé.' },
      showIcon: true,
      showDetails: true,
      buttonText: { en: 'Back to Home', fr: 'Retour à l\'accueil' },
      buttonHref: '/',
    },
  },
];

// Default page configurations for each booking flow step
export const DEFAULT_LANDING_PAGE: PageConfig = {
  id: 'landing',
  name: 'Landing Page',
  path: '/book-appointment',
  sections: [
    {
      id: 'hero-section',
      name: 'Hero',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-1',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'spacer-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'heading-1',
          type: 'heading',
          props: {
            text: { en: 'Welcome to Maison Toa', fr: 'Bienvenue chez Maison Toa' },
            level: 'h1',
            alignment: 'center',
          },
        },
        {
          id: 'text-1',
          type: 'text',
          props: {
            content: {
              en: 'A clinic of aesthetic medicine, surgery and advanced treatments in Lausanne, founded by Dr. Sophie Nordback, FMH specialist in plastic, reconstructive and aesthetic surgery, and Dr. Alexandra Miles, FMH specialist in dermatology and aesthetic medicine.',
              fr: 'Clinique de médecine esthétique, de chirurgie et de soins à Lausanne, fondée par la Dre Sophie Nordback, spécialiste FMH en chirurgie plastique, reconstructive et esthétique, et la Dre Alexandra Miles, spécialiste FMH en dermatologie et médecine esthétique.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'text-2',
          type: 'text',
          props: {
            content: {
              en: 'Maison Toa embodies a refined and contemporary vision of beauty, where aesthetic medicine, expert treatments and longevity medicine come together to reveal what truly matters.',
              fr: 'Maison Tōa incarne une vision exigeante et contemporaine de la beauté, où médecine esthétique, soins experts et médecine de longévité s\'unissent pour révéler l\'essentiel.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'text-3',
          type: 'text',
          props: {
            content: {
              en: 'Surrounded by specialized physicians and expert therapists, each treatment is designed as a bespoke experience, with absolute respect for your identity.',
              fr: 'Entourée de médecins spécialisés et d\'expertes en soins, chaque prise en charge est pensée comme une expérience sur mesure, dans le respect absolu de votre identité.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'text-4',
          type: 'text',
          props: {
            content: {
              en: 'Here, nothing is transformed, everything is enhanced.',
              fr: 'Ici, rien n\'est transformé, tout est sublimé.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'text-5',
          type: 'text',
          props: {
            content: {
              en: 'Maison Toa accompanies you over time with precision, balance and elegance, to preserve, reveal and sustain your natural beauty.',
              fr: 'Maison Tōa vous accompagne dans le temps, avec précision, justesse et élégance, pour préserver, révéler et faire durer votre beauté naturelle.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'spacer-2',
          type: 'spacer',
          props: { height: 'lg' },
        },
        {
          id: 'button-1',
          type: 'button',
          props: {
            text: { en: 'Book Appointment', fr: 'Prendre rendez-vous' },
            href: '/book-appointment/first-visit',
            variant: 'primary',
            size: 'lg',
            icon: 'calendar',
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Book Appointment - Maison Toa', fr: 'Prendre rendez-vous - Maison Toa' },
    description: { en: 'Book your appointment at Maison Toa', fr: 'Prenez rendez-vous chez Maison Toa' },
  },
  settings: {
    backgroundColor: '#f8fafc',
  },
};

// First Visit Page
export const DEFAULT_FIRST_VISIT_PAGE: PageConfig = {
  id: 'first-visit',
  name: 'First Visit',
  path: '/book-appointment/first-visit',
  stepNumber: 1,
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-fv',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'stepper-fv',
          type: 'progress-stepper',
          props: {
            currentStep: 1,
            totalSteps: 5,
            showLabels: false,
          },
        },
        {
          id: 'spacer-fv-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'heading-fv',
          type: 'heading',
          props: {
            text: { en: 'Is this your first visit to Maison Toa?', fr: 'Est-ce votre première visite chez Maison Toa?' },
            level: 'h1',
            alignment: 'center',
          },
        },
        {
          id: 'text-fv',
          type: 'text',
          props: {
            content: {
              en: 'In order to guide you with precision throughout your journey, we kindly ask you to let us know whether you have already attended a consultation with us.',
              fr: 'Afin de vous guider avec précision tout au long de votre parcours, nous vous prions de bien vouloir nous indiquer si vous avez déjà assisté à une consultation chez nous.',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'spacer-fv-2',
          type: 'spacer',
          props: { height: 'lg' },
        },
        {
          id: 'choices-fv',
          type: 'choice-buttons',
          props: {
            choices: [
              {
                id: 'yes',
                label: { en: 'Yes, this is my first visit', fr: 'Oui, c\'est ma première visite' },
                icon: 'check',
                href: '/book-appointment/new-patient',
                variant: 'primary',
              },
              {
                id: 'no',
                label: { en: 'No, I have already had a consultation', fr: 'Non, j\'ai déjà eu une consultation' },
                icon: 'user',
                href: '/book-appointment/existing-patient',
                variant: 'secondary',
              },
            ],
            layout: 'horizontal',
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'First Visit - Maison Toa', fr: 'Première visite - Maison Toa' },
    description: { en: 'Is this your first visit?', fr: 'Est-ce votre première visite?' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: true,
    showBackButton: true,
    backButtonHref: '/book-appointment',
  },
};

// Category Selection Page
export const DEFAULT_CATEGORY_PAGE: PageConfig = {
  id: 'category-selection',
  name: 'Category Selection',
  path: '/book-appointment/new-patient',
  stepNumber: 2,
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-cat',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'stepper-cat',
          type: 'progress-stepper',
          props: {
            currentStep: 2,
            totalSteps: 5,
            showLabels: false,
          },
        },
        {
          id: 'spacer-cat-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'heading-cat',
          type: 'heading',
          props: {
            text: { en: 'Select your desired treatment', fr: 'Sélectionnez la prise en charge souhaitée' },
            level: 'h1',
            alignment: 'center',
          },
        },
        {
          id: 'text-cat',
          type: 'text',
          props: {
            content: {
              en: 'Choose a treatment category to continue',
              fr: 'Choisissez une catégorie de traitement pour continuer',
            },
            alignment: 'center',
            fontSize: 'lg',
          },
        },
        {
          id: 'spacer-cat-2',
          type: 'spacer',
          props: { height: 'lg' },
        },
        {
          id: 'categories-cat',
          type: 'category-grid',
          props: {
            dynamicSource: 'new-patient',
            columns: 4,
            showDescription: false,
            cardStyle: 'bordered',
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Select Category - Maison Toa', fr: 'Sélectionner une catégorie - Maison Toa' },
    description: { en: 'Choose a treatment category', fr: 'Choisissez une catégorie de traitement' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: true,
    showBackButton: true,
    backButtonHref: '/book-appointment/first-visit',
  },
};

// Treatment Selection Page
export const DEFAULT_TREATMENT_PAGE: PageConfig = {
  id: 'treatment-selection',
  name: 'Treatment Selection',
  path: '/book-appointment/new-patient/[category]',
  stepNumber: 3,
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-treat',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'stepper-treat',
          type: 'progress-stepper',
          props: {
            currentStep: 3,
            totalSteps: 5,
            showLabels: false,
          },
        },
        {
          id: 'spacer-treat-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'heading-treat',
          type: 'heading',
          props: {
            text: { en: 'Select your desired treatment', fr: 'Sélectionnez votre traitement' },
            level: 'h1',
            alignment: 'center',
          },
        },
        {
          id: 'spacer-treat-2',
          type: 'spacer',
          props: { height: 'lg' },
        },
        {
          id: 'treatments-treat',
          type: 'treatment-list',
          props: {
            dynamicSource: true,
            showDuration: true,
            showPrice: false,
            columns: 4,
            cardStyle: 'bordered',
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Select Treatment - Maison Toa', fr: 'Sélectionner un traitement - Maison Toa' },
    description: { en: 'Choose your treatment', fr: 'Choisissez votre traitement' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: true,
    showBackButton: true,
    backButtonHref: '/book-appointment/new-patient',
  },
};

// Booking Form Page
export const DEFAULT_BOOKING_FORM_PAGE: PageConfig = {
  id: 'booking-form',
  name: 'Booking Form',
  path: '/book-appointment/new-patient/[category]/[treatment]/[doctor]',
  stepNumber: 4,
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-book',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'stepper-book',
          type: 'progress-stepper',
          props: {
            currentStep: 4,
            totalSteps: 5,
            showLabels: false,
          },
        },
        {
          id: 'spacer-book-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'form-book',
          type: 'booking-form',
          props: {
            title: { en: 'Book an Appointment', fr: 'Prendre un rendez-vous' },
            showTabs: true,
            fields: ['firstName', 'lastName', 'email', 'phone', 'notes'],
            requiredFields: ['firstName', 'lastName', 'email'],
          },
        },
        {
          id: 'spacer-book-2',
          type: 'spacer',
          props: { height: 'lg' },
        },
        {
          id: 'timeslots-book',
          type: 'time-slots',
          props: {
            title: { en: 'Select Date & Time', fr: 'Sélectionner une date et un horaire' },
            subtitle: { en: 'Please select a date', fr: 'Veuillez sélectionner une date' },
            showEarliestAvailable: true,
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Book Appointment - Maison Toa', fr: 'Prendre rendez-vous - Maison Toa' },
    description: { en: 'Complete your booking', fr: 'Complétez votre réservation' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: true,
    showBackButton: true,
    backButtonHref: '/book-appointment/new-patient',
  },
};

// Confirmation Page
export const DEFAULT_CONFIRMATION_PAGE: PageConfig = {
  id: 'confirmation',
  name: 'Confirmation',
  path: '/book-appointment/confirm',
  stepNumber: 5,
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'lg',
      elements: [
        {
          id: 'logo-conf',
          type: 'logo',
          props: {
            src: '/logos/maisontoa-logo.png',
            alt: 'Maison Toa',
            width: 280,
            height: 80,
            alignment: 'center',
          },
        },
        {
          id: 'stepper-conf',
          type: 'progress-stepper',
          props: {
            currentStep: 5,
            totalSteps: 5,
            showLabels: false,
          },
        },
        {
          id: 'spacer-conf-1',
          type: 'spacer',
          props: { height: 'md' },
        },
        {
          id: 'summary-conf',
          type: 'confirmation-summary',
          props: {
            title: { en: 'Confirm Your Appointment', fr: 'Confirmer votre rendez-vous' },
            fields: ['name', 'email', 'phone', 'doctor', 'date', 'time', 'service', 'location'],
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Confirm Booking - Maison Toa', fr: 'Confirmer la réservation - Maison Toa' },
    description: { en: 'Confirm your appointment', fr: 'Confirmez votre rendez-vous' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: true,
    showBackButton: true,
    backButtonHref: '/book-appointment/new-patient',
  },
};

// Success Page
export const DEFAULT_SUCCESS_PAGE: PageConfig = {
  id: 'success',
  name: 'Success',
  path: '/book-appointment/success',
  sections: [
    {
      id: 'main-section',
      name: 'Main Content',
      padding: 'lg',
      maxWidth: 'md',
      elements: [
        {
          id: 'spacer-suc-1',
          type: 'spacer',
          props: { height: 'xl' },
        },
        {
          id: 'success-suc',
          type: 'success-message',
          props: {
            title: { en: 'Appointment Booked!', fr: 'Rendez-vous confirmé!' },
            message: {
              en: 'Your appointment has been confirmed. A confirmation email has been sent to your email address.',
              fr: 'Votre rendez-vous a été confirmé. Un email de confirmation a été envoyé à votre adresse email.',
            },
            showIcon: true,
            showDetails: true,
            buttonText: { en: 'Back to Home', fr: 'Retour à l\'accueil' },
            buttonHref: '/',
          },
        },
      ],
    },
  ],
  metadata: {
    title: { en: 'Booking Confirmed - Maison Toa', fr: 'Réservation confirmée - Maison Toa' },
    description: { en: 'Your booking is confirmed', fr: 'Votre réservation est confirmée' },
  },
  settings: {
    backgroundColor: '#f8fafc',
    showProgressStepper: false,
    showBackButton: false,
  },
};

// All Default Pages
export const DEFAULT_BOOKING_PAGES: Record<BookingPageId, PageConfig> = {
  'landing': DEFAULT_LANDING_PAGE,
  'first-visit': DEFAULT_FIRST_VISIT_PAGE,
  'category-selection': DEFAULT_CATEGORY_PAGE,
  'treatment-selection': DEFAULT_TREATMENT_PAGE,
  'doctor-selection': DEFAULT_TREATMENT_PAGE, // Uses same template
  'booking-form': DEFAULT_BOOKING_FORM_PAGE,
  'confirmation': DEFAULT_CONFIRMATION_PAGE,
  'success': DEFAULT_SUCCESS_PAGE,
};

// Page metadata for the CMS selector
export const BOOKING_PAGE_LIST = [
  { id: 'landing' as BookingPageId, name: 'Landing Page', path: '/book-appointment', icon: 'Home' },
  { id: 'first-visit' as BookingPageId, name: 'First Visit', path: '/book-appointment/first-visit', icon: 'HelpCircle' },
  { id: 'category-selection' as BookingPageId, name: 'Category Selection', path: '/book-appointment/new-patient', icon: 'LayoutGrid' },
  { id: 'treatment-selection' as BookingPageId, name: 'Treatment Selection', path: '/book-appointment/.../[category]', icon: 'List' },
  { id: 'booking-form' as BookingPageId, name: 'Booking Form', path: '/book-appointment/.../[doctor]', icon: 'FileText' },
  { id: 'confirmation' as BookingPageId, name: 'Confirmation', path: '/book-appointment/.../confirm', icon: 'ClipboardCheck' },
  { id: 'success' as BookingPageId, name: 'Success', path: '/book-appointment/success', icon: 'CheckCircle' },
];

export function generateId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
