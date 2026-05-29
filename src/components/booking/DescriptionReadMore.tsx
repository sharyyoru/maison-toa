"use client";

import { useState, useRef, useEffect } from "react";

interface DescriptionReadMoreProps {
  description: string;
  doctorName: string;
  specialty?: string;
  imageUrl?: string;
  maxLines?: number;
  className?: string;
}

export function DescriptionReadMore({
  description,
  doctorName,
  specialty,
  imageUrl,
  maxLines = 2,
  className = "",
}: DescriptionReadMoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [needsTruncation, setNeedsTruncation] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Check if text actually needs truncation
  useEffect(() => {
    if (textRef.current) {
      const lineHeight = parseInt(getComputedStyle(textRef.current).lineHeight) || 20;
      const maxHeight = lineHeight * maxLines;
      setNeedsTruncation(textRef.current.scrollHeight > maxHeight + 4);
    }
  }, [description, maxLines]);

  const handleReadMore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    if (showModal) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showModal]);

  return (
    <>
      {/* Truncated description with Read More */}
      <div className={`relative ${className}`}>
        <p
          ref={textRef}
          className={`text-sm text-slate-500 ${
            !isExpanded ? `line-clamp-${maxLines}` : ""
          }`}
          style={!isExpanded ? { 
            display: "-webkit-box",
            WebkitLineClamp: maxLines,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          } : undefined}
        >
          {description}
        </p>
        {needsTruncation && (
          <button
            type="button"
            onClick={handleReadMore}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors group"
          >
            <span className="underline decoration-slate-300 underline-offset-2 group-hover:decoration-slate-500">
              Read more
            </span>
            <svg 
              className="w-3 h-3 transition-transform group-hover:translate-x-0.5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Modal/Bottom Sheet */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={handleCloseModal}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-fadeIn"
          />
          
          {/* Modal Content */}
          <div 
            className="relative w-full sm:w-auto sm:max-w-lg sm:mx-4 bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl transform transition-all animate-slideUp sm:animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle (Mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-start gap-4 p-5 sm:p-6 border-b border-slate-100">
              {imageUrl && (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 flex-shrink-0">
                  <img 
                    src={imageUrl} 
                    alt={doctorName}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-1">
                  {doctorName}
                </h3>
                {specialty && (
                  <p className="text-sm text-slate-500 font-medium">
                    {specialty}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 -m-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Description */}
            <div className="p-5 sm:p-6 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                About
              </h4>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-wrap">
                {description}
              </p>
            </div>

            {/* Footer */}
            <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl sm:rounded-b-2xl">
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(100%);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out forwards;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out forwards;
        }
      `}</style>
    </>
  );
}
