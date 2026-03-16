/**
 * Simple throttle function. Limits calls to at most once per `delay` ms.
 * When called during the delay period, the most recent arguments are queued
 * and executed after the delay elapses (trailing call).
 */
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()
    const remaining = delay - (now - lastCall)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      lastCall = now
      fn(...args)
    } else {
      lastArgs = args
      if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now()
          timer = null
          if (lastArgs) {
            fn(...lastArgs)
            lastArgs = null
          }
        }, remaining)
      }
    }
  }
}

export default throttle
