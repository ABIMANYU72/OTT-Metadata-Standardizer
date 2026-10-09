"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen } from "lucide-react";

export default function SOPPage() {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/sop-content.md")
      .then((r) => r.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent("SOP document not found. Please ensure docs/SOP.md is copied to web/public/sop-content.md");
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#2A7C13]/20 flex items-center justify-center border border-[#2A7C13]/30">
          <BookOpen className="w-5 h-5 text-[#76C457]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Standard Operating Procedures</h1>
          <p className="text-[#7d8590] text-sm mt-0.5">Catalog QA guidelines, category definitions, and reviewer instructions</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#76C457] border-t-transparent animate-spin" />
            <p className="text-[#7d8590] text-sm">Loading SOP…</p>
          </div>
        </div>
      ) : (
        <div className="glass-card p-8 prose prose-invert max-w-none">
          <style>{`
            .prose h1 { color: #e6edf3; font-size: 1.5rem; margin-top: 0; }
            .prose h2 { color: #76C457; font-size: 1.15rem; border-bottom: 1px solid #21262d; padding-bottom: 6px; margin-top: 2rem; }
            .prose h3 { color: #e6edf3; font-size: 1rem; margin-top: 1.5rem; }
            .prose h4 { color: #7d8590; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; }
            .prose p { color: #7d8590; font-size: 0.875rem; line-height: 1.7; }
            .prose strong { color: #e6edf3; }
            .prose code { color: #76C457; background: #0d1117; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
            .prose pre { background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
            .prose pre code { background: none; color: #e6edf3; }
            .prose table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
            .prose th { background: #161b22; color: #7d8590; text-align: left; padding: 8px 12px; border: 1px solid #21262d; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
            .prose td { padding: 8px 12px; border: 1px solid #21262d; color: #e6edf3; }
            .prose tr:hover td { background: rgba(22, 27, 34, 0.5); }
            .prose ul, .prose ol { color: #7d8590; font-size: 0.875rem; }
            .prose li { margin: 4px 0; }
            .prose blockquote { border-left: 3px solid #2A7C13; padding-left: 16px; color: #7d8590; font-style: italic; }
            .prose a { color: #76C457; }
            .prose hr { border-color: #21262d; margin: 2rem 0; }
          `}</style>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
