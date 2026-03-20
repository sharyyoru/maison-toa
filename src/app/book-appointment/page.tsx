"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

export default function BookAppointmentPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLIFrameElement>(null);

  const handlePlayVideo = () => {
    setIsPlaying(true);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* Logo Header */}
          <div className="text-center mb-8 sm:mb-10">
            <Image
              src="/logos/aesthetics-logo.svg"
              alt="Aesthetics Clinic"
              width={280}
              height={80}
              className="h-12 sm:h-14 md:h-16 w-auto mx-auto"
              priority
            />
          </div>

          {/* Video Section */}
          <div className="max-w-sm mx-auto mb-12">
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
              <div className="relative aspect-[9/16] bg-black">
                {!isPlaying ? (
                  <>
                    {/* Thumbnail with play button */}
                    <Image
                      src="/doctors/welcome.jpg"
                      alt="Welcome Video"
                      fill
                      className="object-cover"
                      priority
                    />
                    <button
                      onClick={handlePlayVideo}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group"
                    >
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                        <svg className="w-8 h-8 sm:w-10 sm:h-10 text-slate-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <span className="absolute bottom-6 left-0 right-0 text-center text-white text-sm font-medium">
                        Press to Play
                      </span>
                    </button>
                  </>
                ) : (
                  <iframe
                    ref={videoRef}
                    src="https://www.youtube.com/embed/u8IIOftkpUs?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&loop=0&fs=0&disablekb=1&playsinline=1"
                    title="Welcome Video"
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen={false}
                  />
                )}
              </div>
              <div className="p-6 text-center">
                <h2 className="text-xl font-semibold text-slate-900">Dr. Xavier Tenorio</h2>
                <p className="text-sm text-slate-500 font-medium">Chirurgien plasticien et esthétique</p>
              </div>
            </div>
          </div>

          {/* Welcome Message */}
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
              Welcome to Aesthetics Clinic
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-8">
              We believe your vision matters. Our mission is to truly listen, understand your unique needs, 
              and make your aesthetic dream become a reality. Start your journey with a free consultation 
              and 3D simulation at any of our clinics in Switzerland. We also offer online consultations 
              where possible, making it easy to connect with us.
            </p>

            {/* CTA Button */}
            <Link
              href="/book-appointment/location"
              className="inline-flex items-center gap-3 bg-slate-900 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-full text-base sm:text-lg font-semibold shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all transform hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Book Appointment
            </Link>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto px-2">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 text-center border border-slate-200 shadow-sm">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 sm:mb-2 text-sm sm:text-base">Free Consultation</h3>
              <p className="text-xs sm:text-sm text-slate-600">Start with a complimentary consultation to discuss your goals</p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 text-center border border-slate-200 shadow-sm">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 sm:mb-2 text-sm sm:text-base">3D Simulation</h3>
              <p className="text-xs sm:text-sm text-slate-600">Visualize your results with advanced 3D technology</p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 text-center border border-slate-200 shadow-sm">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 sm:mb-2 text-sm sm:text-base">Swiss Clinics</h3>
              <p className="text-xs sm:text-sm text-slate-600">Multiple convenient locations across Switzerland</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">
            © {new Date().getFullYear()} Aesthetics Clinic. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
