import type { SVGAttributes } from 'react'

const Logo = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg
      width='1em'
      height='1em'
      viewBox='0 0 40 40'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      {/* Rounded square background */}
      <rect width='40' height='40' rx='10' fill='currentColor' />

      {/* Geometric "A" — two angled strokes meeting at top + horizontal bar */}
      <path
        d='M12 32L20 10L28 32'
        stroke='white'
        strokeWidth='3.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='dark:stroke-black'
      />
      <path
        d='M14.5 25H25.5'
        stroke='white'
        strokeWidth='3.5'
        strokeLinecap='round'
        className='dark:stroke-black'
      />

      {/* AI spark dot — small circle at the apex */}
      <circle
        cx='31'
        cy='9'
        r='3'
        fill='white'
        className='dark:fill-black'
        opacity='0.7'
      />
    </svg>
  )
}

export default Logo
