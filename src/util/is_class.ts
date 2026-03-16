const isClass = (f: unknown): boolean => {
  return (
    typeof f === 'function' &&
    /^class\s/.test(Function.prototype.toString.call(f))
  )
}

export default isClass
