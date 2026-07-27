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
import { PDFJobNotificationsProvider } from "@/components/PDFJobNotificationsContext";
import { InsuranceSubmissionNotificationsProvider } from "@/components/InsuranceSubmissionNotificationsContext";
import { PatientTabsProvider } from "@/components/PatientTabsContext";
import { LayoutModeProvider } from "@/components/LayoutModeContext";
import { ThemeProvider } from "@/components/ThemeContext";
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

const THEME_PREHYDRATION_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('app_theme');
    if (t === 'dark') {
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
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#e0f2fe_40%,_#fdf2ff_80%)] px-4 py-6 sm:px-6 lg:px-8">
          <GlobalLoader />
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              <CommentsUnreadProvider>
                <TasksNotificationsProvider>
                  <EmailNotificationsProvider>
                    <PDFJobNotificationsProvider>
                      <InsuranceSubmissionNotificationsProvider>
                        <PatientTabsProvider>
                          <ThemeProvider>
                            <LayoutModeProvider>
                              <LayoutShellSwitch classicShell={<ClassicShell>{children}</ClassicShell>}>
                                {children}
                              </LayoutShellSwitch>
                            </LayoutModeProvider>
                          </ThemeProvider>
                        </PatientTabsProvider>
                      </InsuranceSubmissionNotificationsProvider>
                    </PDFJobNotificationsProvider>
                  </EmailNotificationsProvider>
                </TasksNotificationsProvider>
              </CommentsUnreadProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
