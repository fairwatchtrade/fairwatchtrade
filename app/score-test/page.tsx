"use client";

import { useState } from "react";
import ListingScoreMeter from "@/components/ListingScoreMeter";
import {
  type ListingState,
  type PhotoCategory,
  type DocumentationStatus,
} from "@/lib/scoring";

const DOC_OPTIONS: DocumentationStatus[] = [
  "Full Set",
  "Papers Only",
  "Box Only",
  "Watch Only",
];

const PHOTO_OPTIONS: PhotoCategory[] = [
  "Dial",
  "Caseback",
  "Clasp/Pin Buckle",
  "Bracelet/Strap",
  "Full watch, strap/bracelet extended",
  "Movement",
  "Side/Lugs",
  "Box",
  "Papers/Warranty",
  "Other",
];

export default function ScoreTestPage() {
  const [significanceScore, setSignificance] = useState(72);
  const [photoCategories, setPhotos] = useState<PhotoCategory[]>([]);
  const [hasBracelet, setHasBracelet] = useState(false);
  const [hasWristShot, setHasWristShot] = useState(false);
  const [documentation, setDoc] = useState<DocumentationStatus>("Watch Only");
  const [descriptionWordCount, setWords] = useState(0);
  const [descriptionPassedAI, setPassed] = useState(false);

  const listing: ListingState = {
    significanceScore,
    photoCategories,
    hasBracelet,
    hasWristShot,
    documentation,
    descriptionWordCount,
    descriptionPassedAI,
  };

  function addPhoto(cat: PhotoCategory) {
    setPhotos((p) => [...p, cat]);
  }
  function clearPhotos() {
    setPhotos([]);
  }

  const label = "text-[12px] text-[#8A8F9E]";
  const chip =
    "rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-[#E8E4DC] hover:bg-white/5";

  return (
    <main className="min-h-screen bg-[#0D0F14] px-4 py-10">
      <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
        <div>
          <h1 className="mb-1 text-xl font-medium text-[#E8E4DC]">
            Scoring meter demo
          </h1>
          <p className="mb-5 text-[13px] text-[#8A8F9E]">
            Throwaway page. Toggle inputs and watch the score climb.
          </p>

          <div className="space-y-4">
            <div>
              <div className={label}>Significance (Part 1): {significanceScore}</div>
              <input
                type="range"
                min={0}
                max={100}
                value={significanceScore}
                onChange={(e) => setSignificance(Number(e.target.value))}
                className="w-full accent-[#C9A84C]"
              />
            </div>

            <div>
              <div className={`${label} mb-1`}>
                Add photos ({photoCategories.length} added)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PHOTO_OPTIONS.map((c) => (
                  <button key={c} onClick={() => addPhoto(c)} className={chip}>
                    + {c}
                  </button>
                ))}
                <button
                  onClick={clearPhotos}
                  className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-[#8A8F9E] hover:bg-white/5"
                >
                  clear
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#E8E4DC]">
              <input
                type="checkbox"
                checked={hasBracelet}
                onChange={(e) => setHasBracelet(e.target.checked)}
                className="accent-[#C9A84C]"
              />
              On a bracelet (needs full strap/bracelet-extended shot)
            </label>

            <label className="flex items-center gap-2 text-[12px] text-[#E8E4DC]">
              <input
                type="checkbox"
                checked={hasWristShot}
                onChange={(e) => setHasWristShot(e.target.checked)}
                className="accent-[#C9A84C]"
              />
              Wrist shot included
            </label>

            <div>
              <div className={`${label} mb-1`}>Documentation</div>
              <select
                value={documentation}
                onChange={(e) => setDoc(e.target.value as DocumentationStatus)}
                className="w-full rounded-md border border-white/15 bg-[#13151C] px-2 py-1.5 text-[13px] text-[#E8E4DC]"
              >
                {DOC_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className={label}>Description words: {descriptionWordCount}</div>
              <input
                type="range"
                min={0}
                max={150}
                value={descriptionWordCount}
                onChange={(e) => setWords(Number(e.target.value))}
                className="w-full accent-[#C9A84C]"
              />
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#E8E4DC]">
              <input
                type="checkbox"
                checked={descriptionPassedAI}
                onChange={(e) => setPassed(e.target.checked)}
                className="accent-[#C9A84C]"
              />
              Description passed AI check
            </label>
          </div>
        </div>

        <div className="md:pt-1">
          <ListingScoreMeter listing={listing} />
        </div>
      </div>
    </main>
  );
}
