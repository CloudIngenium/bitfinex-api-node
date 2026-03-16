/**
 * Resolves the message payload; useful for getting around sequence numbers
 */
const getMessagePayload = (msg: any[] = []): any[] | undefined => {
  for (let i = msg.length - 1; i >= 0; i--) {
    if (Array.isArray(msg[i])) return msg[i]
  }
  return undefined
}

export default getMessagePayload
