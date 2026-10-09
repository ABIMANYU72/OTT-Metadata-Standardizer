"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Sliders,
  FileSpreadsheet,
  BookOpen,
  Tv2,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/queue", label: "Review Queue", icon: ListChecks },
  { href: "/lab", label: "Threshold Lab", icon: Sliders },
  { href: "/report", label: "Daily Report", icon: FileSpreadsheet },
  { href: "/sop", label: "SOP", icon: BookOpen },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#0d1117] border-r border-[#21262d] flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-[#21262d]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2A7C13] to-[#76C457] flex items-center justify-center">
            <Tv2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#e6edf3] leading-tight">Catalog QC</div>
            <div className="text-xs text-[#7d8590]">Quality Checker</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom badge */}
      <div className="p-4 border-t border-[#21262d]">
        <div className="glass-card p-3 text-center">
          <div className="text-xs text-[#7d8590]">Powered by</div>
          <div className="text-xs font-semibold text-[#76C457] mt-0.5">TMDB + rapidfuzz</div>
        </div>
      </div>
    </aside>
  );
}
