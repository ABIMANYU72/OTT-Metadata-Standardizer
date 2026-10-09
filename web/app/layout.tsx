import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Catalog Quality Checker | OTT Metadata QA Dashboard",
  description:
    "Advanced streaming catalog QA tool that detects duplicates and metadata errors with AI-powered analysis.",
  keywords: ["catalog", "QA", "duplicates", "metadata", "OTT", "streaming"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-[#0d1117] text-[#e6edf3] min-h-screen`}>
        <div className="flex min-h-screen">
          <Navigation />
          <main className="flex-1 ml-64 p-8 overflow-auto">
            {children}
          </main>
        </div>
        <footer className="ml-64 px-8 py-4 text-xs text-[#7d8590] border-t border-[#21262d] text-center">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </body>
    </html>
  );
}
