#!/usr/bin/env node
'use strict'
const INIT = require('.')

const interactive = !(process.argv.includes('-s') || process.argv.includes('--silent'))

INIT(process.cwd(), `${__dirname}/template`, {
  github: 'delucis',
  namespaces: ['delucis'],
  interactive: interactive
})
