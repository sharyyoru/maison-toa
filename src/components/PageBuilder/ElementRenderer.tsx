"use client";

import { PageElement, PageSection } from "./types";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Clock,
  Check,
  User,
  Star,
  Heart,
  CheckCircle,
} from "lucide-react";

interface ElementRendererProps {
  element: PageElement;
  language: "en" | "fr";
  isEditing?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

const getLocalizedText = (
  text: { en: string; fr: string } | string | undefined,
  lang: "en" | "fr"
): string => {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] || text.en || "";
};

export function ElementRenderer({
  element,
  language,
  isEditing = false,
  isSelected = false,
  onClick,
}: ElementRendererProps) {
  const wrapperClasses = isEditing
    ? `relative group cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-blue-500 ring-offset-2"
          : "hover:ring-2 hover:ring-blue-300 hover:ring-offset-2"
      }`
    : "";

  const renderElement = () => {
    switch (element.type) {
      case "logo":
        return (
          <div
            className={`flex ${
              element.props.alignment === "center"
                ? "justify-center"
                : element.props.alignment === "right"
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <Image
              src={element.props.src}
              alt={element.props.alt}
              width={element.props.width}
              height={element.props.height}
              className="object-contain"
            />
          </div>
        );

      case "heading":
        const headingSizes = {
          h1: "text-3xl sm:text-4xl font-bold",
          h2: "text-2xl sm:text-3xl font-bold",
          h3: "text-xl sm:text-2xl font-semibold",
          h4: "text-lg sm:text-xl font-semibold",
        };
        const headingClasses = `${headingSizes[element.props.level]} text-slate-900 ${
          element.props.alignment === "center"
            ? "text-center"
            : element.props.alignment === "right"
            ? "text-right"
            : "text-left"
        }`;
        const headingStyle = { color: element.props.color };
        const headingContent = getLocalizedText(element.props.text, language);
        
        if (element.props.level === "h1") {
          return <h1 className={headingClasses} style={headingStyle}>{headingContent}</h1>;
        } else if (element.props.level === "h2") {
          return <h2 className={headingClasses} style={headingStyle}>{headingContent}</h2>;
        } else if (element.props.level === "h3") {
          return <h3 className={headingClasses} style={headingStyle}>{headingContent}</h3>;
        } else {
          return <h4 className={headingClasses} style={headingStyle}>{headingContent}</h4>;
        }

      case "text":
        const fontSizes = {
          sm: "text-sm",
          base: "text-base",
          lg: "text-lg",
          xl: "text-xl",
        };
        return (
          <p
            className={`${fontSizes[element.props.fontSize]} text-slate-600 leading-relaxed ${
              element.props.alignment === "center"
                ? "text-center"
                : element.props.alignment === "right"
                ? "text-right"
                : "text-left"
            }`}
            style={{ color: element.props.color }}
          >
            {getLocalizedText(element.props.content, language)}
          </p>
        );

      case "image":
        return (
          <div className="flex justify-center">
            <Image
              src={element.props.src}
              alt={getLocalizedText(element.props.alt, language)}
              width={element.props.width || 400}
              height={element.props.height || 300}
              className={`object-cover ${
                element.props.rounded ? "rounded-2xl" : ""
              } ${element.props.shadow ? "shadow-lg" : ""}`}
            />
          </div>
        );

      case "button":
        const buttonVariants = {
          primary:
            "bg-slate-900 text-white hover:bg-slate-800 shadow-lg hover:shadow-xl",
          secondary:
            "bg-slate-100 text-slate-900 hover:bg-slate-200",
          outline:
            "bg-transparent border-2 border-slate-900 text-slate-900 hover:bg-slate-50",
        };
        const buttonSizes = {
          sm: "px-4 py-2 text-sm",
          md: "px-6 py-3 text-base",
          lg: "px-8 py-4 text-lg",
        };
        const ButtonIcon = {
          calendar: Calendar,
          "arrow-right": ArrowRight,
          phone: Phone,
          email: Mail,
          none: null,
        }[element.props.icon || "none"];

        const buttonContent = (
          <>
            {ButtonIcon && <ButtonIcon className="w-5 h-5" />}
            {getLocalizedText(element.props.text, language)}
          </>
        );

        if (isEditing) {
          return (
            <div
              className={`flex ${
                element.props.fullWidth ? "w-full" : ""
              } justify-center`}
            >
              <span
                className={`inline-flex items-center gap-2 rounded-full font-semibold transition-all ${
                  buttonVariants[element.props.variant]
                } ${buttonSizes[element.props.size]} ${
                  element.props.fullWidth ? "w-full justify-center" : ""
                }`}
              >
                {buttonContent}
              </span>
            </div>
          );
        }

        return (
          <div
            className={`flex ${
              element.props.fullWidth ? "w-full" : ""
            } justify-center`}
          >
            <Link
              href={element.props.href}
              className={`inline-flex items-center gap-2 rounded-full font-semibold transition-all transform hover:scale-105 ${
                buttonVariants[element.props.variant]
              } ${buttonSizes[element.props.size]} ${
                element.props.fullWidth ? "w-full justify-center" : ""
              }`}
            >
              {buttonContent}
            </Link>
          </div>
        );

      case "spacer":
        const spacerHeights = {
          xs: "h-2",
          sm: "h-4",
          md: "h-8",
          lg: "h-12",
          xl: "h-16",
        };
        return (
          <div
            className={`${spacerHeights[element.props.height]} ${
              isEditing ? "bg-blue-50 border border-dashed border-blue-200 rounded" : ""
            }`}
          >
            {isEditing && (
              <div className="h-full flex items-center justify-center text-xs text-blue-400">
                Spacer ({element.props.height})
              </div>
            )}
          </div>
        );

      case "divider":
        const dividerWidths = {
          full: "w-full",
          half: "w-1/2",
          quarter: "w-1/4",
        };
        return (
          <div className="flex justify-center py-2">
            <div
              className={`${dividerWidths[element.props.width || "full"]} border-t ${
                element.props.style === "dashed"
                  ? "border-dashed"
                  : element.props.style === "dotted"
                  ? "border-dotted"
                  : "border-solid"
              } border-slate-200`}
              style={{ borderColor: element.props.color }}
            />
          </div>
        );

      case "card":
        return (
          <div
            className={`p-6 rounded-2xl ${
              element.props.variant === "bordered"
                ? "border border-slate-200 bg-white"
                : element.props.variant === "elevated"
                ? "bg-white shadow-lg"
                : "bg-slate-50"
            }`}
          >
            {element.props.image && (
              <Image
                src={element.props.image}
                alt=""
                width={400}
                height={200}
                className="w-full h-40 object-cover rounded-xl mb-4"
              />
            )}
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {getLocalizedText(element.props.title, language)}
            </h3>
            <p className="text-slate-600">
              {getLocalizedText(element.props.description, language)}
            </p>
          </div>
        );

      case "feature-grid":
        return (
          <div
            className={`grid gap-6 ${
              element.props.columns === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : element.props.columns === 3
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            }`}
          >
            {element.props.items.map((item) => (
              <div
                key={item.id}
                className="p-6 bg-white rounded-2xl border border-slate-200 text-center"
              >
                <div className="w-12 h-12 mx-auto mb-4 bg-slate-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">{item.icon}</span>
                </div>
                <h4 className="font-semibold text-slate-900 mb-2">
                  {getLocalizedText(item.title, language)}
                </h4>
                <p className="text-sm text-slate-600">
                  {getLocalizedText(item.description, language)}
                </p>
              </div>
            ))}
          </div>
        );

      case "testimonial":
        return (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center max-w-2xl mx-auto">
            <p className="text-lg text-slate-600 italic mb-6">
              "{getLocalizedText(element.props.quote, language)}"
            </p>
            <div className="flex items-center justify-center gap-3">
              {element.props.avatar && (
                <Image
                  src={element.props.avatar}
                  alt={element.props.author}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full object-cover"
                />
              )}
              <div className="text-left">
                <p className="font-semibold text-slate-900">
                  {element.props.author}
                </p>
                <p className="text-sm text-slate-500">
                  {getLocalizedText(element.props.role, language)}
                </p>
              </div>
            </div>
          </div>
        );

      case "contact-info":
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto">
            {element.props.showPhone && element.props.phone && (
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
                <Phone className="w-5 h-5 text-slate-400" />
                <span className="text-slate-700">{element.props.phone}</span>
              </div>
            )}
            {element.props.showEmail && element.props.email && (
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
                <Mail className="w-5 h-5 text-slate-400" />
                <span className="text-slate-700">{element.props.email}</span>
              </div>
            )}
            {element.props.showAddress && element.props.address && (
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
                <MapPin className="w-5 h-5 text-slate-400" />
                <span className="text-slate-700">
                  {getLocalizedText(element.props.address, language)}
                </span>
              </div>
            )}
            {element.props.showHours && element.props.hours && (
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
                <Clock className="w-5 h-5 text-slate-400" />
                <span className="text-slate-700">
                  {getLocalizedText(element.props.hours, language)}
                </span>
              </div>
            )}
          </div>
        );

      case "hero":
        return (
          <div
            className={`py-12 px-6 rounded-2xl ${
              element.props.alignment === "center"
                ? "text-center"
                : element.props.alignment === "right"
                ? "text-right"
                : "text-left"
            }`}
            style={{
              backgroundColor: element.props.backgroundColor || "transparent",
              backgroundImage: element.props.backgroundImage
                ? `url(${element.props.backgroundImage})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {element.props.showLogo && element.props.logoUrl && (
              <Image
                src={element.props.logoUrl}
                alt="Logo"
                width={200}
                height={60}
                className={`mb-6 ${
                  element.props.alignment === "center"
                    ? "mx-auto"
                    : element.props.alignment === "right"
                    ? "ml-auto"
                    : ""
                }`}
              />
            )}
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              {getLocalizedText(element.props.title, language)}
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              {getLocalizedText(element.props.subtitle, language)}
            </p>
          </div>
        );

      // Booking Flow Elements
      case "progress-stepper":
        return (
          <div className="flex items-center justify-center space-x-2 my-6">
            {Array.from({ length: element.props.totalSteps }).map((_, idx) => (
              <div key={idx} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    idx < element.props.currentStep
                      ? "bg-slate-900 text-white"
                      : "bg-slate-300 text-slate-500"
                  }`}
                >
                  <span className="text-sm font-medium">{idx + 1}</span>
                </div>
                {idx < element.props.totalSteps - 1 && (
                  <div className="w-12 h-0.5 bg-slate-300 mx-1"></div>
                )}
              </div>
            ))}
          </div>
        );

      case "choice-buttons":
        const getChoiceIcon = (iconName: string | undefined) => {
          switch (iconName) {
            case "check": return <Check className="w-6 h-6" />;
            case "user": return <User className="w-6 h-6" />;
            case "calendar": return <Calendar className="w-6 h-6" />;
            case "star": return <Star className="w-6 h-6" />;
            case "heart": return <Heart className="w-6 h-6" />;
            default: return null;
          }
        };
        return (
          <div
            className={`flex gap-4 justify-center ${
              element.props.layout === "vertical" ? "flex-col items-center" : "flex-col sm:flex-row"
            }`}
          >
            {element.props.choices.map((choice) => (
              <Link
                key={choice.id}
                href={choice.href}
                className={`inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105 min-w-[280px] ${
                  choice.variant === "primary"
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-white text-slate-900 border-2 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {choice.icon && choice.icon !== "none" && getChoiceIcon(choice.icon)}
                {getLocalizedText(choice.label, language)}
              </Link>
            ))}
          </div>
        );

      case "category-grid":
        return (
          <div
            className={`grid gap-4 ${
              element.props.columns === 2
                ? "grid-cols-2"
                : element.props.columns === 3
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            }`}
          >
            {/* Dynamic categories placeholder */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm text-center">
              <p className="text-slate-400 text-sm">
                {language === "en" ? "Categories load dynamically" : "Les catégories se chargent dynamiquement"}
              </p>
            </div>
          </div>
        );

      case "treatment-list":
        return (
          <div
            className={`grid gap-4 ${
              element.props.columns === 2
                ? "grid-cols-2"
                : element.props.columns === 3
                ? "grid-cols-2 sm:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            }`}
          >
            {/* Dynamic treatments placeholder */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 shadow-sm text-center">
              <p className="text-slate-400 text-sm">
                {language === "en" ? "Treatments load dynamically" : "Les traitements se chargent dynamiquement"}
              </p>
            </div>
          </div>
        );

      case "booking-form":
        return (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 shadow-lg max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {getLocalizedText(element.props.title, language)}
            </h2>
            {element.props.showTabs && (
              <div className="flex gap-2 mb-6">
                <div className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-medium">
                  1. {language === "en" ? "Personal Info" : "Infos personnelles"}
                </div>
                <div className="px-4 py-2 bg-slate-200 text-slate-600 rounded-full text-sm font-medium">
                  2. {language === "en" ? "Date & Time" : "Date et heure"}
                </div>
                <div className="px-4 py-2 bg-slate-200 text-slate-600 rounded-full text-sm font-medium">
                  3. {language === "en" ? "Confirm" : "Confirmer"}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {element.props.fields.includes("firstName") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {language === "en" ? "First Name" : "Prénom"} *
                  </label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-300 rounded-xl" disabled />
                </div>
              )}
              {element.props.fields.includes("lastName") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {language === "en" ? "Last Name" : "Nom"} *
                  </label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-300 rounded-xl" disabled />
                </div>
              )}
              {element.props.fields.includes("email") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {language === "en" ? "Email Address" : "Adresse email"} *
                  </label>
                  <input type="email" className="w-full px-4 py-3 border border-slate-300 rounded-xl" disabled />
                </div>
              )}
              {element.props.fields.includes("phone") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {language === "en" ? "Phone Number" : "Numéro de téléphone"}
                  </label>
                  <input type="tel" className="w-full px-4 py-3 border border-slate-300 rounded-xl" disabled />
                </div>
              )}
            </div>
          </div>
        );

      case "time-slots":
        return (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 shadow-lg max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {getLocalizedText(element.props.title, language)}
            </h3>
            <p className="text-slate-600 mb-6">
              {getLocalizedText(element.props.subtitle, language)}
            </p>
            {element.props.showEarliestAvailable && (
              <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg mb-4 text-sm">
                {language === "en" ? "Earliest availability: " : "Prochaine disponibilité: "}
                <span className="font-medium">Saturday, April 18 at 09:00</span>
              </div>
            )}
            <div className="space-y-4">
              <input type="date" className="w-full px-4 py-3 border border-slate-300 rounded-xl" disabled />
              <div className="grid grid-cols-4 gap-2">
                {["09:00", "09:30", "10:00", "10:30"].map((time) => (
                  <div key={time} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-center text-sm">
                    {time}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "confirmation-summary":
        return (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 shadow-lg max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {getLocalizedText(element.props.title, language)}
            </h2>
            <div className="space-y-3">
              {element.props.fields.map((field) => (
                <div key={field} className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600 capitalize">{field}</span>
                  <span className="font-medium text-slate-900">-</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-4">
              <button className="flex-1 px-6 py-3 border border-slate-300 rounded-xl text-slate-700" disabled>
                {language === "en" ? "Back" : "Retour"}
              </button>
              <button className="flex-1 px-6 py-3 bg-slate-900 text-white rounded-xl" disabled>
                {language === "en" ? "Confirm Booking" : "Confirmer"}
              </button>
            </div>
          </div>
        );

      case "success-message":
        return (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-lg max-w-md mx-auto text-center">
            {element.props.showIcon && (
              <div className="w-16 h-16 mx-auto mb-6 bg-slate-900 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
            )}
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {getLocalizedText(element.props.title, language)}
            </h2>
            <p className="text-slate-600 mb-6">
              {getLocalizedText(element.props.message, language)}
            </p>
            {element.props.showDetails && (
              <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left text-sm space-y-1">
                <p><span className="text-slate-500">Date:</span> Saturday, April 18, 2026</p>
                <p><span className="text-slate-500">Time:</span> 17:30</p>
                <p><span className="text-slate-500">Service:</span> Miradry</p>
              </div>
            )}
            <Link
              href={element.props.buttonHref}
              className="inline-block px-8 py-3 bg-slate-900 text-white rounded-full font-medium hover:bg-slate-800 transition-colors"
            >
              {getLocalizedText(element.props.buttonText, language)}
            </Link>
          </div>
        );

      default:
        return (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
            Unknown element type: {(element as PageElement).type}
          </div>
        );
    }
  };

  if (isEditing) {
    return (
      <div className={wrapperClasses} onClick={onClick}>
        {renderElement()}
        {isSelected && (
          <div className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-medium">
            {element.type}
          </div>
        )}
      </div>
    );
  }

  return renderElement();
}

interface SectionRendererProps {
  section: PageSection;
  language: "en" | "fr";
  isEditing?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
}

export function SectionRenderer({
  section,
  language,
  isEditing = false,
  selectedElementId,
  onSelectElement,
}: SectionRendererProps) {
  const paddingSizes = {
    none: "py-0",
    sm: "py-4",
    md: "py-8",
    lg: "py-12",
    xl: "py-16",
  };

  const maxWidths = {
    sm: "max-w-2xl",
    md: "max-w-4xl",
    lg: "max-w-6xl",
    xl: "max-w-7xl",
    full: "max-w-full",
  };

  return (
    <section
      className={`${paddingSizes[section.padding || "md"]} px-4`}
      style={{ backgroundColor: section.backgroundColor }}
    >
      <div className={`mx-auto ${maxWidths[section.maxWidth || "lg"]} space-y-4`}>
        {section.elements.map((element) => (
          <ElementRenderer
            key={element.id}
            element={element}
            language={language}
            isEditing={isEditing}
            isSelected={selectedElementId === element.id}
            onClick={() => onSelectElement?.(element.id)}
          />
        ))}
      </div>
    </section>
  );
}
