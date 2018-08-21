import test from 'ava'
import m from '../'

test('imports module', test => {
  test.is(typeof m, 'function')
})
