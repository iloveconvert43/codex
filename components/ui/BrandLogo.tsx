/**
 * BrandLogo — tryHushly logo component
 * 
 * Renders: small "try" + gradient "Hushly"
 * 
 * Usage:
 *   <BrandLogo size="sm" />   → for navbars (try + Hushly, 16px/20px)
 *   <BrandLogo size="md" />   → for auth pages (try + Hushly, 18px/28px)
 *   <BrandLogo size="lg" />   → for landing/hero (try + Hushly, 20px/38px)
 */

interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  xs: { try: 'text-[10px]', hushly: 'text-base' },
  sm: { try: 'text-[11px]', hushly: 'text-xl' },
  md: { try: 'text-[14px]', hushly: 'text-[28px]' },
  lg: { try: 'text-[17px]', hushly: 'text-[38px]' },
  xl: { try: 'text-[20px]', hushly: 'text-[52px]' } }

export default function BrandLogo({ size = 'sm', className = '' }: BrandLogoProps) {
  const s = sizes[size]
  return (
    <span className={`inline-flex items-baseline gap-0.5 leading-none ${className}`}>
      <span className={`${s.try} font-medium text-white/40 tracking-tight`}>
        try
      </span>
      <span
        className={`${s.hushly} font-bold tracking-tight`}
        style={{
          background: 'linear-gradient(135deg, #6C63FF, #FF6B6B)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text' }}
      >
        Hushly
      </span>
    </span>
  )
}
