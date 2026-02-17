'use strict'

const isClass = require('./is_class')
const isSnapshot = require('./is_snapshot')
const precision = require('./precision')

module.exports = {
  isClass,
  isSnapshot,
  ...precision
}
