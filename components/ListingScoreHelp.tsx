import React, { useState, useRef, useEffect } from 'react';

// The centralized tier logic (acting as your "Black Box" barrier)
const SCORE_TIERS = [
  { max: 49, name: "Incomplete", next: "Basic", advice: "Focus on the fundamentals: upload at least 4 clear photos, set an asking price, and complete all required fields." },
  { max: 59, name: "Basic", next: "Solid", advice: "Add a description in your own voice. Explain why you bought the piece and its history; authenticity starts with your story." },
  { max: 69, name: "Solid", next: "Strong", advice: "Add a wrist shot for scale and a photo of the case back to show the integrity of the rear casing." },
  { max: 79, name: "Strong", next: "Collector Grade", advice: "Include 'Box and Papers' photos if available. If missing, provide a clear statement regarding the origin of the piece." },
  { max: 89, name: "Collector Grade", next: "Exceptional", advice: "Include movement photography (if accessible) or macro shots of the dial/indices to highlight the condition." },
  { max: 94, name: "Exceptional", next: "Museum Grade", advice: "Provide supporting evidence: service records, original purchase receipts, or a detailed timeline of ownership history." },
  { max: 100, name: "Museum Grade", next: null, advice: "Outstanding listing quality. This represents the FairWatchTrade standard for documentation and transparency." }
];

function getTierContext(score: number) {
  return SCORE_TIERS.find(t => score <= t.max) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

interface ListingScoreHelpProps {
  score: number;
}

export default function ListingScoreHelp({ score }: ListingScoreHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const tierContext = getTierContext(score);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center ml-2" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-5 h-5 rounded-full bg-[#C9A84C] text-[#0D0F14] text-xs font-bold hover:bg-[#C9A84C]/90 transition-colors focus:outline-none"
        aria-label="How to improve your score"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute z-50 left-1/2 transform -translate-x-1/2 mt-2 top-full w-72 bg-[#0D0F14] border border-white/15 rounded-lg shadow-xl p-4 text-sm text-[#E8E4DC]">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/15">
            <span className="font-semibold text-[#E8E4DC]">Listing Score Guide</span>
            <span className="font-mono bg-[#13151C] px-2 py-1 rounded text-xs">{score} / 100</span>
          </div>

          <div className="mb-3">
            <span className="block text-xs text-[#8A8F9E] uppercase tracking-wider mb-1">Current Tier</span>
            <span className="font-medium text-[#C9A84C]">{tierContext.name}</span>
          </div>

          <div className="bg-[#13151C] rounded p-3 mb-1">
            {tierContext.next ? (
              <>
                <span className="block text-xs text-[#8A8F9E] uppercase tracking-wider mb-1">Path to {tierContext.next}</span>
                <p className="text-[#E8E4DC] leading-relaxed">{tierContext.advice}</p>
              </>
            ) : (
              <>
                <span className="block text-xs text-[#C9A84C] uppercase tracking-wider mb-1">Maximum Achieved</span>
                <p className="text-[#E8E4DC] leading-relaxed">{tierContext.advice}</p>
              </>
            )}
          </div>
          <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-[#0D0F14] border-t border-l border-white/15 rotate-45"></div>
        </div>
      )}
    </div>
  );
}
