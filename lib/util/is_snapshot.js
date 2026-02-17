'use strict'

const isSnapshot = msg => Array.isArray(msg) && msg.length > 0 && Array.isArray(msg[0])

module.exports = isSnapshot
