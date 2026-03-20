"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

// QR Code URLs - these are permanent
const QR_CODES = [
  {
    id: "intake",
    title: "Patient Intake Form",
    url: "https://aestheticclinic.vercel.app/intake",
    description: "Scan to complete your patient intake form",
  },
  {
    id: "booking",
    title: "Book Appointment",
    url: "https://aestheticclinic.vercel.app/book-appointment",
    description: "Scan to book an appointment",
  },
];

// Simple QR code generator using Google Charts API (permanent, no dependencies)
function getQRCodeUrl(url: string, size: number = 300): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&format=svg`;
}

export default function QRCodesPage() {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async (qrUrl: string, filename: string) => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <main className="min-h-screen bg-white p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 print:mb-4">
          <Image
            src="/logos/aesthetics-logo.svg"
            alt="Aesthetics Clinic"
            width={200}
            height={60}
            className="h-12 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl sm:text-3xl font-light text-black mb-2">QR Codes</h1>
          <p className="text-slate-600 text-sm print:hidden">
            Permanent QR codes for patient intake and appointment booking
          </p>
        </div>

        {/* Print Button */}
        <div className="flex justify-center gap-4 mb-8 print:hidden">
          <button
            onClick={handlePrint}
            className="px-6 py-2 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors"
          >
            Print All QR Codes
          </button>
        </div>

        {/* QR Codes Grid */}
        <div ref={printRef} className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-4">
          {QR_CODES.map((qr) => (
            <div
              key={qr.id}
              className="border border-slate-200 rounded-2xl p-6 text-center print:border-black print:rounded-none"
            >
              <h2 className="text-xl font-medium text-black mb-2">{qr.title}</h2>
              <p className="text-sm text-slate-600 mb-4">{qr.description}</p>
              
              {/* QR Code Image */}
              <div className="flex justify-center mb-4">
                <img
                  src={getQRCodeUrl(qr.url, 250)}
                  alt={`QR Code for ${qr.title}`}
                  className="w-48 h-48 sm:w-56 sm:h-56"
                />
              </div>
              
              {/* URL Display */}
              <p className="text-xs text-slate-500 font-mono break-all mb-4 print:text-black">
                {qr.url}
              </p>
              
              {/* Download Button */}
              <button
                onClick={() => handleDownload(getQRCodeUrl(qr.url, 500), `qr-${qr.id}`)}
                className="text-sm text-black underline hover:no-underline print:hidden"
              >
                Download SVG
              </button>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mt-8 p-4 rounded-lg bg-slate-50 border border-slate-200 print:hidden">
          <h3 className="font-medium text-black mb-2">How to use these QR codes:</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Print this page to have physical QR codes for your clinic</li>
            <li>• Download individual SVG files for high-quality printing</li>
            <li>• These QR codes are permanent and will always work</li>
            <li>• Place them in your waiting room, reception desk, or marketing materials</li>
          </ul>
        </div>

        {/* Large Print Version for Posters */}
        <div className="mt-12 print:hidden">
          <h2 className="text-xl font-medium text-black mb-4 text-center">Large Format (for posters)</h2>
          <div className="grid grid-cols-1 gap-8">
            {QR_CODES.map((qr) => (
              <div
                key={`large-${qr.id}`}
                className="border border-slate-200 rounded-2xl p-8 text-center"
              >
                <h2 className="text-2xl font-medium text-black mb-2">{qr.title}</h2>
                <p className="text-slate-600 mb-6">{qr.description}</p>
                
                <div className="flex justify-center mb-6">
                  <img
                    src={getQRCodeUrl(qr.url, 400)}
                    alt={`QR Code for ${qr.title}`}
                    className="w-72 h-72 sm:w-80 sm:h-80"
                  />
                </div>
                
                <p className="text-sm text-slate-500 font-mono">{qr.url}</p>
                
                <button
                  onClick={() => handleDownload(getQRCodeUrl(qr.url, 1000), `qr-${qr.id}-large`)}
                  className="mt-4 px-6 py-2 rounded-full bg-black text-white font-medium hover:bg-slate-800 transition-colors"
                >
                  Download Large SVG (1000px)
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
