import { useEffect, useRef } from "react"

/** Deterministic PRNG so the demo frame looks the same every load. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A greyscale star field, like a raw camera frame. Inside `night-frame`
 * it is multiplied onto pure red, so only the red channel survives.
 */
function StarField({ width = 640, height = 400 }: { width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current?.getContext("2d")
    if (!ctx) return
    const rnd = mulberry32(42)
    // Greyscale only (r = g = b): this is "white light" from the sensor.
    ctx.fillStyle = "rgb(8 8 8)"
    ctx.fillRect(0, 0, width, height)
    for (let i = 0; i < 260; i++) {
      const x = rnd() * width
      const y = rnd() * height
      const m = rnd() ** 3
      const r = 0.6 + m * 2.6
      const g = Math.round(90 + m * 165)
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2)
      grad.addColorStop(0, `rgb(${g} ${g} ${g})`)
      grad.addColorStop(1, "rgb(0 0 0 / 0)")
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // A faint nebula smudge.
    const neb = ctx.createRadialGradient(width * 0.62, height * 0.45, 0, width * 0.62, height * 0.45, 90)
    neb.addColorStop(0, "rgb(70 70 70 / 0.6)")
    neb.addColorStop(1, "rgb(0 0 0 / 0)")
    ctx.fillStyle = neb
    ctx.fillRect(0, 0, width, height)
  }, [width, height])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className="block h-auto w-full"
      aria-label="Simulated camera frame"
    />
  )
}

export { StarField }
