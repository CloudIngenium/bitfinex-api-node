import assert from 'node:assert'
import _isObject from 'lodash/isObject.js'
import _isFunction from 'lodash/isFunction.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setupModule: any = await import('../../examples/util/setup.js')
const { args, debug, debugTable, readline } = setupModule

describe('setup', () => {
  it('provides a debugger', () => {
    assert.ok(_isObject(args), 'setup doesnt provide a tooling object')
    assert.ok(_isFunction(debug), 'setup doesnt provide a debug() instance')
    assert.ok(_isFunction(debugTable), 'setup doesnt provide a debugTable() instance')
  })

  it('provides a readline instance', () => {
    assert.ok(_isFunction(readline.questionAsync), 'no readline instance provided')
  })
}).timeout(10 * 1000) // timeout for travis
