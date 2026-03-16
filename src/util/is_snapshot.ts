const isSnapshot = (msg: unknown[]): boolean =>
  Array.isArray(msg) && msg.length > 0 && Array.isArray(msg[0])

export default isSnapshot
