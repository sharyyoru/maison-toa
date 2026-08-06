import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import GlobalLoader from "@/components/GlobalLoader";
import { AuthProvider } from "@/components/AuthContext";
import { CommentsUnreadProvider } from "@/components/CommentsUnreadContext";
import { TasksNotificationsProvider } from "@/components/TasksNotificationsContext";
import { EmailNotificationsProvider } from "@/components/EmailNotificationsContext";
import { DealNotificationsProvider } from "@/components/DealNotificationsContext";
import { PDFJobNotificationsProvider } from "@/components/PDFJobNotificationsContext";
import { InsuranceSubmissionNotificationsProvider } from "@/components/InsuranceSubmissionNotificationsContext";
import { PatientTabsProvider } from "@/components/PatientTabsContext";
import { LayoutModeProvider } from "@/components/LayoutModeContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { ShellBackground } from "@/components/ShellVisibility";
import LayoutShellSwitch from "@/components/LayoutShellSwitch";
import ClassicShell from "@/components/ClassicShell";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clinic CRM",
  description: "Medical CRM and ERP for clinics",
};

// Public, patient-facing pages must never inherit an admin's CRM dark-mode
// preference — the "dark" utility overrides in globals.css assume the
// Blizzard dashboard shell (.blz-content) and aren't safe on these
// standalone pages. Keep this list in sync with STANDALONE_ROUTES in
// LayoutShellSwitch.tsx.
const PUBLIC_STANDALONE_ROUTES = [
  "/login",
  "/book-appointment",
  "/intake",
  "/onboarding",
  "/invoice/pay",
  "/consultations",
  "/embed",
  "/form",
  "/appointments/manage",
  "/register",
];

const THEME_PREHYDRATION_SCRIPT = `
(function(){
  try {
    var publicRoutes = ${JSON.stringify(PUBLIC_STANDALONE_ROUTES)};
    var path = window.location.pathname;
    var isPublicRoute = publicRoutes.some(function(route) {
      return path === route || path.indexOf(route + '/') === 0;
    });
    var t = localStorage.getItem('app_theme');
    if (t === 'dark' && !isPublicRoute) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_PREHYDRATION_SCRIPT,
          }}
        />
      </head>
      <body
        className={`${manrope.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <CommentsUnreadProvider>
              <TasksNotificationsProvider>
                <EmailNotificationsProvider>
                  <DealNotificationsProvider>
                    <PDFJobNotificationsProvider>
                      <InsuranceSubmissionNotificationsProvider>
                        <PatientTabsProvider>
                          <ThemeProvider>
                            <LayoutModeProvider>
                              <ShellBackground>
                                <GlobalLoader />
                                <LayoutShellSwitch classicShell={<ClassicShell>{children}</ClassicShell>}>
                                  {children}
                                </LayoutShellSwitch>
                              </ShellBackground>
                            </LayoutModeProvider>
                          </ThemeProvider>
                        </PatientTabsProvider>
                      </InsuranceSubmissionNotificationsProvider>
                    </PDFJobNotificationsProvider>
                  </DealNotificationsProvider>
                </EmailNotificationsProvider>
              </TasksNotificationsProvider>
            </CommentsUnreadProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
