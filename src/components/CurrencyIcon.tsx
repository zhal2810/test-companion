interface CurrencyIconProps {
  className?: string;
}

/**
 * Ikon mata uang in-game (cc) — pakai gambar koin asli dari game, bukan teks "cc".
 * Taruh inline sejajar angka: `<b>123.45</b> <CurrencyIcon />`
 */
export default function CurrencyIcon({ className = 'w-3.5 h-3.5 inline-block align-[-2px]' }: CurrencyIconProps) {
  return (
    <img
      src="/assets/cc-coin.png"
      alt="cc"
      className={`${className} object-contain select-none`}
      draggable={false}
    />
  );
}