/** IconPark Topic (outline) — local copy to avoid full @icon-park/react bundle. */
export function Topic({
  theme: _theme = "outline",
  size = 20,
  fill = "#F8FAFC",
  className,
}: {
  theme?: "outline" | "filled" | "two-tone" | "multi-color"
  size?: number | string
  fill?: string
  className?: string
}) {
  const stroke = fill
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 26.7117 4.53967 29.2974 5.51747 31.6554C6.02232 32.8729 6.64396 34.0297 7.36843 35.1119C7.61157 35.4751 7.15543 37.7711 6 42C10.2289 40.8446 12.5249 40.3884 12.8881 40.6316C13.9703 41.356 15.1271 41.9777 16.3446 42.4825C18.7026 43.4603 21.2883 44 24 44Z"
        stroke={stroke}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d="M16.6045 19.8201H33.3838"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.8467 15.7378L18.933 32.2622"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28.8467 15.7378L25.933 32.2622"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.6045 28H31.3838"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
