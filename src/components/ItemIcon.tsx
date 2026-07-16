import React, { useState } from 'react';

interface ItemIconProps {
  itemCode: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function ItemIcon({ itemCode, className = '', size = 'md' }: ItemIconProps) {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  };

  const code = itemCode.toLowerCase();

  // If no image error, we attempt to load the actual asset file (e.g., from VS Code local public directory)
  if (!imgError) {
    return (
      <img
        src={`/assets/items/${code}.png`}
        alt={itemCode}
        className={`${sizeClasses[size]} object-contain select-none ${className}`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  // --- FALLBACK BEAUTIFUL CUSTOM SVG ICONS ---
  // Each SVG represents a premium visual fallback that mimics the uploaded assets
  const renderFallbackSVG = () => {
    switch (code) {
      case 'limestone': // Light grey stone/rock
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="limestoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D1D5DB" />
                <stop offset="50%" stopColor="#9CA3AF" />
                <stop offset="100%" stopColor="#4B5563" />
              </linearGradient>
            </defs>
            <path d="M12 28 L28 10 L48 14 L54 36 L40 54 L16 48 Z" fill="url(#limestoneGrad)" stroke="#374151" strokeWidth="2" strokeLinejoin="round" />
            <path d="M28 10 L36 34 L40 54 M36 34 L12 28 M36 34 L48 14" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="22" cy="22" r="1.5" fill="#E5E7EB" opacity="0.6" />
            <circle cx="44" cy="28" r="1" fill="#E5E7EB" opacity="0.6" />
            <circle cx="30" cy="44" r="1.5" fill="#E5E7EB" opacity="0.6" />
          </svg>
        );

      case 'grain': // Sack of grain / feed
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D97706" />
                <stop offset="60%" stopColor="#B45309" />
                <stop offset="100%" stopColor="#78350F" />
              </linearGradient>
              <linearGradient id="grainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FCD34D" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>
            {/* Sack body */}
            <path d="M16 26 C16 20, 48 20, 48 26 C48 38, 44 54, 32 56 C20 54, 16 38, 16 26 Z" fill="url(#sackGrad)" stroke="#451A03" strokeWidth="2" strokeLinejoin="round" />
            {/* Sack mouth / tie */}
            <path d="M22 22 C26 25, 38 25, 42 22 L45 16 C40 18, 24 18, 19 16 Z" fill="url(#grainGrad)" stroke="#451A03" strokeWidth="2" strokeLinejoin="round" />
            <path d="M28 23 C30 21, 34 21, 36 23" stroke="#451A03" strokeWidth="2.5" strokeLinecap="round" />
            {/* Grain detail inside sack */}
            <ellipse cx="32" cy="15" rx="10" ry="4" fill="url(#grainGrad)" />
            <circle cx="28" cy="14" r="1.5" fill="#FFFBEB" />
            <circle cx="34" cy="15" r="1.5" fill="#FFFBEB" />
            <circle cx="31" cy="16" r="1" fill="#FFFBEB" />
          </svg>
        );

      case 'livestock': // Cow (brown/white pattern)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="100%" stopColor="#E2E8F0" />
              </linearGradient>
            </defs>
            {/* Horns */}
            <path d="M18 18 C14 10, 10 14, 12 18 C14 20, 18 20, 18 20 Z" fill="#E2E8F0" stroke="#475569" strokeWidth="1.5" />
            <path d="M46 18 C50 10, 54 14, 52 18 C50 20, 46 20, 46 20 Z" fill="#E2E8F0" stroke="#475569" strokeWidth="1.5" />
            {/* Cow Body/Head */}
            <rect x="14" y="20" width="36" height="30" rx="8" fill="url(#cowGrad)" stroke="#1E293B" strokeWidth="2" />
            {/* Brown Cow Spots */}
            <path d="M14 24 C20 24, 22 30, 20 34 C16 34, 14 30, 14 24 Z" fill="#78350F" />
            <path d="M34 32 C40 30, 46 32, 48 38 C42 42, 36 38, 34 32 Z" fill="#78350F" />
            {/* Eyes */}
            <circle cx="24" cy="30" r="3" fill="#0F172A" />
            <circle cx="40" cy="30" r="3" fill="#0F172A" />
            <circle cx="25" cy="29" r="1" fill="#FFFFFF" />
            <circle cx="41" cy="29" r="1" fill="#FFFFFF" />
            {/* Snout */}
            <rect x="20" y="38" width="24" height="10" rx="5" fill="#FDA4AF" stroke="#E11D48" strokeWidth="1.5" />
            <circle cx="27" cy="43" r="1.5" fill="#BE123C" />
            <circle cx="37" cy="43" r="1.5" fill="#BE123C" />
          </svg>
        );

      case 'fish': // Salmon / trout fish jumping
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fishGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="40%" stopColor="#0284C7" />
                <stop offset="75%" stopColor="#EC4899" /> {/* Pink stripe of salmon */}
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
            </defs>
            {/* Tail fin */}
            <path d="M52 24 L58 14 L55 30 L58 46 L52 36 Z" fill="url(#fishGrad)" stroke="#0284C7" strokeWidth="1.5" />
            {/* Body */}
            <path d="M8 32 C16 16, 44 20, 52 30 C44 42, 16 44, 8 32 Z" fill="url(#fishGrad)" stroke="#0B3C5D" strokeWidth="2" strokeLinejoin="round" />
            {/* Eye */}
            <circle cx="16" cy="28" r="2" fill="#FFFFFF" />
            <circle cx="15.5" cy="27.5" r="0.8" fill="#000000" />
            {/* Gills */}
            <path d="M22 26 C24 28, 24 34, 22 36" stroke="#0B3C5D" strokeWidth="1.5" strokeLinecap="round" />
            {/* Fins */}
            <path d="M30 38 L34 46 L26 42 Z" fill="#0284C7" />
            <path d="M32 24 L36 16 L28 20 Z" fill="#0284C7" />
          </svg>
        );

      case 'iron': // Iron Ore (grey rock with red/orange rust spots)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ironGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#64748B" />
                <stop offset="50%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1E293B" />
              </linearGradient>
              <linearGradient id="rustGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EA580C" />
                <stop offset="100%" stopColor="#9A3412" />
              </linearGradient>
            </defs>
            <path d="M10 32 L22 12 L44 10 L54 28 L46 50 L20 48 Z" fill="url(#ironGrad)" stroke="#0F172A" strokeWidth="2" />
            {/* Rust veins/spots */}
            <path d="M22 12 L30 26 L20 48" stroke="url(#rustGrad)" strokeWidth="3" strokeLinecap="round" />
            <path d="M44 10 L34 28 L46 50" stroke="url(#rustGrad)" strokeWidth="4" strokeLinecap="round" />
            <circle cx="34" cy="28" r="5" fill="url(#rustGrad)" />
            <path d="M30 26 L10 32" stroke="url(#rustGrad)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );

      case 'coca': // Green leaf (Coca leaves)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="leafGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#15803D" />
                <stop offset="60%" stopColor="#22C55E" />
                <stop offset="100%" stopColor="#86EFAC" />
              </linearGradient>
            </defs>
            {/* Leaf shape */}
            <path d="M8 56 C20 46, 16 16, 54 10 C44 38, 20 46, 8 56 Z" fill="url(#leafGrad)" stroke="#14532D" strokeWidth="2" strokeLinejoin="round" />
            {/* Leaf Veins */}
            <path d="M8 56 L46 17" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M20 45 C24 38, 30 38, 34 39" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M28 37 C34 30, 42 30, 46 31" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 48 C20 42, 26 44, 28 46" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

      case 'lead': // Lead ore (dark heavy slate stone)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="leadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="40%" stopColor="#334155" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
            </defs>
            <path d="M16 20 L32 8 L50 18 L52 40 L34 54 L12 42 Z" fill="url(#leadGrad)" stroke="#1E293B" strokeWidth="2" />
            <path d="M32 8 L32 32 L34 54 M32 32 L16 20 M32 32 L50 18 M32 32 L12 42 L52 40" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
            <rect x="24" y="24" width="8" height="6" rx="1" fill="#94A3B8" opacity="0.3" transform="rotate(-15 24 24)" />
          </svg>
        );

      case 'petroleum': // Crude oil drum/barrel
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="barrelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#020617" />
              </linearGradient>
            </defs>
            {/* Drum body */}
            <path d="M16 16 C16 10, 48 10, 48 16 L48 48 C48 54, 16 54, 16 48 Z" fill="url(#barrelGrad)" stroke="#0F172A" strokeWidth="2" />
            {/* Rings on barrel */}
            <path d="M16 26 C20 29, 44 29, 48 26" stroke="#475569" strokeWidth="2" />
            <path d="M16 38 C20 41, 44 41, 48 38" stroke="#475569" strokeWidth="2" />
            {/* Top Ellipse */}
            <ellipse cx="32" cy="16" rx="16" ry="6" fill="#475569" stroke="#0F172A" strokeWidth="2" />
            <ellipse cx="32" cy="16" rx="12" ry="4" fill="#334155" />
            {/* Oil drop sign on barrel */}
            <path d="M32 28 C28 35, 36 35, 32 28 Z" fill="#EAB308" />
            <circle cx="32" cy="33" r="2.5" fill="#EAB308" />
          </svg>
        );

      case 'wood': // Wood logs (stacked)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#854D0E" />
                <stop offset="100%" stopColor="#451A03" />
              </linearGradient>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="100%" stopColor="#CA8A04" />
              </linearGradient>
            </defs>
            {/* Back log */}
            <rect x="22" y="16" width="30" height="16" rx="4" fill="url(#logGrad)" stroke="#451A03" strokeWidth="1.5" />
            <ellipse cx="22" cy="24" rx="4" ry="8" fill="url(#ringGrad)" stroke="#451A03" strokeWidth="1.5" />

            {/* Bottom logs */}
            <rect x="14" y="32" width="36" height="18" rx="5" fill="url(#logGrad)" stroke="#451A03" strokeWidth="2" />
            <ellipse cx="14" cy="41" rx="5" ry="9" fill="url(#ringGrad)" stroke="#451A03" strokeWidth="2" />
            <circle cx="14" cy="41" r="5" stroke="#854D0E" strokeWidth="1" fill="none" />
            <circle cx="14" cy="41" r="2.5" stroke="#854D0E" strokeWidth="1" fill="none" />
          </svg>
        );

      case 'concrete': // Concrete hollow block (cinder block)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="concreteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="60%" stopColor="#64748B" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>
            {/* Block outer frame */}
            <rect x="8" y="18" width="48" height="28" rx="3" fill="url(#concreteGrad)" stroke="#334155" strokeWidth="2" />
            {/* 3D top edge */}
            <path d="M8 18 L16 10 L56 10 L56 38 L48 46" stroke="#334155" strokeWidth="2" fill="#CBD5E1" strokeLinejoin="round" />
            <path d="M48 18 L56 10" stroke="#334155" strokeWidth="2" />
            {/* Hollow chambers */}
            <rect x="14" y="24" width="14" height="16" rx="2" fill="#1E293B" stroke="#334155" strokeWidth="1.5" />
            <rect x="36" y="24" width="14" height="16" rx="2" fill="#1E293B" stroke="#334155" strokeWidth="1.5" />
          </svg>
        );

      case 'steel': // Steel I-beam / girder
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="steelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="40%" stopColor="#475569" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
            </defs>
            {/* Shiny steel ingot / bars stacked */}
            <path d="M6 34 L20 18 L58 18 L44 34 Z" fill="url(#steelGrad)" stroke="#1E293B" strokeWidth="2" />
            <path d="M6 34 L6 44 L44 44 L44 34 Z" fill="#334155" stroke="#1E293B" strokeWidth="2" />
            <path d="M44 44 L58 28 L58 18 L44 34 Z" fill="#1E293B" stroke="#1E293B" strokeWidth="2" strokeLinejoin="round" />
            {/* Specular line */}
            <path d="M21 20 L57 20" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            {/* Second Ingot below */}
            <path d="M12 46 L22 36 L40 36" stroke="#1E293B" strokeWidth="2" />
          </svg>
        );

      case 'bread': // Baguette bread (golden brown)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="breadGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#9A3412" />
                <stop offset="50%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#FBBF24" />
              </linearGradient>
            </defs>
            {/* Baguette body */}
            <path d="M10 46 C6 40, 44 8, 52 12 C60 16, 20 54, 10 46 Z" fill="url(#breadGrad)" stroke="#7C2D12" strokeWidth="2" />
            {/* Score marks (cuts) */}
            <path d="M18 38 C22 36, 26 38, 22 42" stroke="#7C2D12" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M28 28 C32 26, 36 28, 32 32" stroke="#7C2D12" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M38 18 C42 16, 46 18, 42 22" stroke="#7C2D12" strokeWidth="2.5" strokeLinecap="round" />
            {/* Flour dusting */}
            <ellipse cx="30" cy="24" rx="4" ry="1.5" fill="#FFFBEB" opacity="0.4" transform="rotate(-35 30 24)" />
          </svg>
        );

      case 'steak': // Beef Steak
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="meatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="60%" stopColor="#B91C1C" />
                <stop offset="100%" stopColor="#7F1D1D" />
              </linearGradient>
            </defs>
            {/* Steak cut */}
            <path d="M12 36 C8 24, 24 10, 44 14 C56 16, 54 36, 42 46 C30 54, 16 48, 12 36 Z" fill="url(#meatGrad)" stroke="#450A0A" strokeWidth="2.5" strokeLinejoin="round" />
            {/* Fat boundary edge */}
            <path d="M44 14 C56 16, 54 36, 42 46" stroke="#FEF2F2" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
            {/* Bone */}
            <circle cx="26" cy="24" r="5" fill="#FFFBEB" stroke="#450A0A" strokeWidth="2" />
            <circle cx="26" cy="24" r="2" fill="#E5E7EB" />
            {/* Marbling lines */}
            <path d="M34 22 C38 24, 42 22, 44 26" stroke="#FEE2E2" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M28 36 C32 38, 38 36, 40 40" stroke="#FEE2E2" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

      case 'cookedfish': // Salmon steak / fish slice
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cookedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB923C" />
                <stop offset="50%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#C2410C" />
              </linearGradient>
            </defs>
            {/* Fish slice cross-section */}
            <path d="M32 10 C46 10, 52 24, 46 44 L32 54 L18 44 C12 24, 18 10, 32 10 Z" fill="url(#cookedGrad)" stroke="#431407" strokeWidth="2" strokeLinejoin="round" />
            {/* Silver skin boundary */}
            <path d="M18 44 C12 24, 18 10, 32 10 C46 10, 52 24, 46 44" stroke="#94A3B8" strokeWidth="2.5" fill="none" opacity="0.6" />
            {/* Salmon center gap / spine hole */}
            <path d="M32 26 L36 34 L32 38 L28 34 Z" fill="#1E293B" stroke="#431407" strokeWidth="1.5" />
            {/* Meat flake lines */}
            <path d="M32 16 C26 18, 22 24, 20 32" stroke="#FFEDD5" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            <path d="M32 16 C38 18, 42 24, 44 32" stroke="#FFEDD5" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            <path d="M32 22 C28 24, 26 28, 24 34" stroke="#FFEDD5" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
            <path d="M32 22 C36 24, 38 28, 40 34" stroke="#FFEDD5" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
          </svg>
        );

      case 'lightammo': // Single handgun bullet
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FCD34D" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <linearGradient id="tipGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>
            <g transform="rotate(30 32 32)">
              {/* Bullet casing */}
              <rect x="24" y="24" width="16" height="28" rx="2" fill="url(#brassGrad)" stroke="#78350F" strokeWidth="1.5" />
              {/* Casing base rim */}
              <rect x="22" y="48" width="20" height="4" rx="1" fill="#D97706" stroke="#78350F" strokeWidth="1.5" />
              {/* Bullet tip / warhead */}
              <path d="M24 24 C24 12, 40 12, 40 24 Z" fill="url(#tipGrad)" stroke="#1E293B" strokeWidth="1.5" />
              {/* Specular highlights */}
              <path d="M28 16 L28 44" stroke="#FFF" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
            </g>
          </svg>
        );

      case 'ammo': // Double rifle bullets clip
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brassGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FCD34D" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <linearGradient id="tipGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1E293B" />
              </linearGradient>
            </defs>
            {/* First Bullet (Back) */}
            <g transform="translate(-6, -4) rotate(15 32 32)">
              <rect x="22" y="22" width="14" height="28" rx="1" fill="url(#brassGrad2)" stroke="#78350F" strokeWidth="1.5" />
              <rect x="20" y="46" width="18" height="4" rx="1" fill="#D97706" stroke="#78350F" strokeWidth="1.5" />
              <path d="M22 22 C22 10, 36 10, 36 22 Z" fill="url(#tipGrad2)" stroke="#1E293B" strokeWidth="1.5" />
            </g>
            {/* Second Bullet (Front) */}
            <g transform="translate(6, 4) rotate(15 32 32)">
              <rect x="22" y="22" width="14" height="28" rx="1" fill="url(#brassGrad2)" stroke="#78350F" strokeWidth="1.5" />
              <rect x="20" y="46" width="18" height="4" rx="1" fill="#D97706" stroke="#78350F" strokeWidth="1.5" />
              <path d="M22 22 C22 10, 36 10, 36 22 Z" fill="url(#tipGrad2)" stroke="#1E293B" strokeWidth="1.5" />
              <path d="M26 14 L26 40" stroke="#FFF" strokeWidth="1.2" opacity="0.4" />
            </g>
          </svg>
        );

      case 'heavyammo': // Triple rifle bullets (Heavy Ammo)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brassGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FBBF24" />
                <stop offset="50%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#7C2D12" />
              </linearGradient>
              <linearGradient id="tipGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#64748B" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
            </defs>
            {/* Left bullet */}
            <g transform="translate(-10, 4) rotate(10 32 32)">
              <rect x="24" y="20" width="12" height="30" fill="url(#brassGrad3)" stroke="#7C2D12" strokeWidth="1.5" />
              <path d="M24 20 C24 8, 36 8, 36 20 Z" fill="url(#tipGrad3)" stroke="#1E293B" strokeWidth="1.5" />
            </g>
            {/* Right bullet */}
            <g transform="translate(10, 4) rotate(10 32 32)">
              <rect x="24" y="20" width="12" height="30" fill="url(#brassGrad3)" stroke="#7C2D12" strokeWidth="1.5" />
              <path d="M24 20 C24 8, 36 8, 36 20 Z" fill="url(#tipGrad3)" stroke="#1E293B" strokeWidth="1.5" />
            </g>
            {/* Center bullet (front) */}
            <g transform="translate(0, -2) rotate(10 32 32)">
              <rect x="24" y="20" width="12" height="30" fill="url(#brassGrad3)" stroke="#7C2D12" strokeWidth="1.5" />
              <rect x="22" y="47" width="16" height="3" fill="#D97706" stroke="#7C2D12" strokeWidth="1.5" />
              <path d="M24 20 C24 8, 36 8, 36 20 Z" fill="url(#tipGrad3)" stroke="#1E293B" strokeWidth="1.5" />
              <path d="M28 12 L28 42" stroke="#FFF" strokeWidth="1" opacity="0.4" />
            </g>
          </svg>
        );

      case 'cocain': // Red/white chemical capsule pill
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pillRed" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="100%" stopColor="#991B1B" />
              </linearGradient>
              <linearGradient id="pillWhite" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#D1D5DB" />
              </linearGradient>
            </defs>
            <g transform="rotate(-45 32 32)">
              {/* Capsule body (white half bottom) */}
              <path d="M18 32 L46 32 C46 44, 18 44, 18 32 Z" fill="url(#pillWhite)" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
              {/* Capsule body (red half top) */}
              <path d="M18 32 L46 32 C46 20, 18 20, 18 32 Z" fill="url(#pillRed)" stroke="#7F1D1D" strokeWidth="2" strokeLinejoin="round" />
              {/* Center join band */}
              <rect x="17" y="31" width="30" height="2" fill="#E2E8F0" opacity="0.8" />
              {/* Specular line */}
              <path d="M24 24 C28 22, 36 22, 40 24" stroke="#FFF" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
            </g>
          </svg>
        );

      case 'oil': // Refined Oil (glossy black oil drop)
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="oilDrop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4B5563" />
                <stop offset="50%" stopColor="#111827" />
                <stop offset="100%" stopColor="#030712" />
              </linearGradient>
            </defs>
            {/* Droplet shape */}
            <path d="M32 10 C32 10, 52 34, 52 44 C52 54, 12 54, 12 44 C12 34, 32 10, 32 10 Z" fill="url(#oilDrop)" stroke="#111827" strokeWidth="2" strokeLinejoin="round" />
            {/* Highlight bubble */}
            <path d="M24 40 C20 40, 18 36, 20 30 C22 34, 26 34, 24 40 Z" fill="#9CA3AF" opacity="0.4" />
            <path d="M32 18 C30 22, 24 28, 22 34" stroke="#FFFFFF" strokeWidth="2.5" opacity="0.3" strokeLinecap="round" />
          </svg>
        );

      case 'paper': // Stack of paper sheets
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#E2E8F0" />
              </linearGradient>
            </defs>
            {/* Bottom sheet */}
            <rect x="16" y="22" width="34" height="34" rx="2" fill="#94A3B8" stroke="#475569" strokeWidth="1.5" transform="rotate(-6 33 39)" />
            {/* Middle sheet */}
            <rect x="15" y="20" width="34" height="34" rx="2" fill="#CBD5E1" stroke="#475569" strokeWidth="1.5" transform="rotate(-3 32 37)" />
            {/* Top sheet */}
            <rect x="14" y="18" width="34" height="34" rx="2" fill="url(#paperGrad)" stroke="#1E293B" strokeWidth="2" />
            {/* Ruled lines detail on top sheet */}
            <line x1="20" y1="26" x2="42" y2="26" stroke="#94A3B8" strokeWidth="1.5" />
            <line x1="20" y1="32" x2="42" y2="32" stroke="#94A3B8" strokeWidth="1.5" />
            <line x1="20" y1="38" x2="42" y2="38" stroke="#94A3B8" strokeWidth="1.5" />
            <line x1="20" y1="44" x2="34" y2="44" stroke="#94A3B8" strokeWidth="1.5" />
          </svg>
        );

      case 'case1': // Weapon/Ammo Supply Case
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="caseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1E3A8A" />
                <stop offset="50%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
              <linearGradient id="latchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#94A3B8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>
            <rect x="8" y="16" width="48" height="32" rx="4" fill="url(#caseGrad)" stroke="#0F172A" strokeWidth="2.5" />
            <rect x="6" y="14" width="8" height="8" rx="1.5" fill="#475569" stroke="#0F172A" strokeWidth="1.5" />
            <rect x="50" y="14" width="8" height="8" rx="1.5" fill="#475569" stroke="#0F172A" strokeWidth="1.5" />
            <rect x="6" y="42" width="8" height="8" rx="1.5" fill="#475569" stroke="#0F172A" strokeWidth="1.5" />
            <rect x="50" y="42" width="8" height="8" rx="1.5" fill="#475569" stroke="#0F172A" strokeWidth="1.5" />
            <rect x="18" y="20" width="4" height="24" rx="1" fill="#334155" />
            <rect x="26" y="20" width="4" height="24" rx="1" fill="#334155" />
            <rect x="34" y="20" width="4" height="24" rx="1" fill="#334155" />
            <rect x="42" y="20" width="4" height="24" rx="1" fill="#334155" />
            <rect x="28" y="24" width="8" height="12" rx="1" fill="url(#latchGrad)" stroke="#0F172A" strokeWidth="1.5" />
            <circle cx="32" cy="30" r="1.5" fill="#1E293B" />
          </svg>
        );

      default: // Default generic pack/crate icon
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="defaultGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0369A1" />
              </linearGradient>
            </defs>
            <rect x="12" y="16" width="40" height="36" rx="4" fill="url(#defaultGrad)" stroke="#0284C7" strokeWidth="2" />
            <path d="M12 28 L52 28 M12 40 L52 40 M28 16 L28 52 M40 16 L40 52" stroke="#025A87" strokeWidth="1.5" />
          </svg>
        );
    }
  };

  return (
    <div className={`shrink-0 flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {renderFallbackSVG()}
    </div>
  );
}
