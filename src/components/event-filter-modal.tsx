"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Destination } from "@/lib/types";

function ChipMultiSelect({
  label,
  options,
  selected,
  onToggle,
  placeholder,
  checkboxClass,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder: string;
  checkboxClass: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div>
      <p className="text-sm font-bold text-slate-900 mb-2">{label}</p>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 flex items-center flex-wrap gap-1.5 text-left hover:border-slate-300 transition-colors"
        >
          {selected.length === 0 && <span className="text-sm text-slate-400">{placeholder}</span>}
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
              {v}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(v);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <ChevronDown size={16} className={`ml-auto text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto p-1.5">
            {options.length === 0 && <p className="px-2.5 py-2 text-sm text-slate-400">No options</p>}
            {options.map((o) => {
              const checked = selected.includes(o);
              return (
                <label key={o} className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-sm text-slate-700">
                  <input type="checkbox" checked={checked} onChange={() => onToggle(o)} className={`rounded border-slate-300 ${checkboxClass}`} />
                  {o}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventFilterModal({
  open,
  onClose,
  destinations,
  selectedDestIds,
  onToggleDest,
  months,
  selectedMonths,
  onToggleMonth,
  locations,
  selectedLocations,
  onToggleLocation,
  onClear,
  resultCount,
  accent = "purple",
}: {
  open: boolean;
  onClose: () => void;
  destinations: Destination[];
  selectedDestIds: string[];
  onToggleDest: (id: string) => void;
  months: string[];
  selectedMonths: string[];
  onToggleMonth: (month: string) => void;
  locations: string[];
  selectedLocations: string[];
  onToggleLocation: (location: string) => void;
  onClear: () => void;
  resultCount: number;
  accent?: "purple" | "blue";
}) {
  if (!open) return null;

  const accentBg = accent === "blue" ? "bg-[#1098F7] hover:bg-[#0b7dd1]" : "bg-[#C21FAF] hover:bg-[#93147D]";
  const checkedBorder = accent === "blue" ? "border-[#1098F7] bg-[#1098F7]/5" : "border-[#C21FAF] bg-[#C21FAF]/5";
  const checkboxClass = accent === "blue" ? "text-[#1098F7] focus:ring-[#1098F7]" : "text-[#C21FAF] focus:ring-[#C21FAF]";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4 animate-modal-backdrop" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[88vh] flex flex-col shadow-2xl animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Filter events by</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          <div>
            <p className="text-sm font-bold text-slate-900 mb-3">Study destinations</p>
            <div className="grid grid-cols-2 gap-2.5">
              {destinations.map((d) => {
                const checked = selectedDestIds.includes(d.id);
                return (
                  <label
                    key={d.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                      checked ? checkedBorder : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleDest(d.id)}
                      className={`rounded border-slate-300 ${checkboxClass}`}
                    />
                    <span className="text-base leading-none">{d.flag}</span>
                    <span className="text-sm text-slate-700">{d.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <ChipMultiSelect label="Event month" options={months} selected={selectedMonths} onToggle={onToggleMonth} placeholder="Any month" checkboxClass={checkboxClass} />
          </div>

          <div className="border-t border-slate-100 pt-5">
            <ChipMultiSelect label="Event location" options={locations} selected={selectedLocations} onToggle={onToggleLocation} placeholder="Any location" checkboxClass={checkboxClass} />
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="px-5 py-2.5 rounded-full border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Clear all
          </button>
          <button type="button" onClick={onClose} className={`flex-1 py-2.5 rounded-full text-sm font-semibold text-white transition-colors ${accentBg}`}>
            Show {resultCount} result{resultCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
