const FS = require('fs')
const PATH = require('path')
const QX = require('@perl/qx').sync
const SYS = require('@perl/system').sync
const GITINFO = require('hosted-git-info')
const STDIN = require('read')
const READ = FS.readFileSync
const WRITE = FS.writeFileSync
const EXISTS = FS.existsSync
const MKDIR = FS.mkdirSync

/**
 * Run the package initialisation flow
 * @param  {String}  pkg               Path to the package being initialised
 * @param  {String}  template          Path to the initialiser’s template dir
 * @param  {Object}  opts
 * @param  {String}  opts.github       Github username for package author/org
 * @param  {Array}   [namespaces=[]]   Any namespaces used by the user
 * @param  {Boolean} [interactive=true] Should the initialiser prompt for input?
 * @return {Promise}
 */
module.exports = async (pkg, template, { github, namespaces = [], interactive = true } = {}) => {
  console.log(`Setting up project with @delucis’s defaults...\n\nPress ^C at any time to quit.\n`)

  namespaces = namespaces.join('|')
  let pj = {}
  try { pj = JSON.parse(READ(`${pkg}/package.json`)) } catch (_) {}
  let tj = {}
  try { tj = JSON.parse(READ(`${template}/package.json`)) } catch (_) {}

  if (!pj.name) {
    const pdir = PATH.parse(pkg).name
    const [, scope, name] = RegExp(`^(${namespaces})?-?(.+)$`).exec(pdir)
    pj.name = (scope ? `@${scope}/` : '') + name
  }

  if (interactive) {
    pj.name = await PROMPT({
      prompt: 'package name:',
      default: pj.name
    })

    pj.description = await PROMPT({
      prompt: 'description:',
      default: pj.description || '🆕'
    })
  } else if (!pj.description) {
    pj.description = ' '
  }

  if (!pj.author) pj.author = tj.author

  if (!pj.license) pj.license = tj.license || 'GPL-3.0'

  if (tj.scripts) {
    if (!pj.scripts) pj.scripts = {}
    Object.keys(tj.scripts).forEach(script => {
      if (!pj.scripts[script]) pj.scripts[script] = tj.scripts[script]
    })
  }

  if (tj.devDependencies) {
    if (!pj.devDependencies) pj.devDependencies = {}
    Object.keys(tj.devDependencies).forEach(dep => {
      if (!pj.devDependencies[dep]) pj.devDependencies[dep] = tj.devDependencies[dep]
    })
  }

  if (tj.config) {
    if (!pj.config) pj.config = {}
    Object.keys(tj.config).forEach(setting => {
      if (!pj.config[setting]) pj.config[setting] = tj.config[setting]
    })
  }

  if (!pj.repository) {
    pj.repository = {}
    if (!pj.repository.type) pj.repository.type = 'git'
    if (pj.repository.type === 'git' && !pj.repository.url) {
      if (EXISTS(`${pkg}/.git`)) {
        pj.repository.url = QX`git remote get-url origin`.trim()
      }
      if (!pj.repository.url && github) {
        const reponame = pj.name.replace(/\W/g, '-').replace(/-+/g, '-').replace(/^-|-$/, '')
        pj.repository.url = `https://github.com/${github}/${reponame}.git`
      } else {
        delete pj.repository.url
      }
    }
  }
  let repo
  if (pj.repository.url) {
    repo = GITINFO.fromUrl(pj.repository.url)
    if (!pj.bugs) pj.bugs = repo.bugs()
    if (!pj.homepage) pj.homepage = `https://npmjs.com/package/${pj.name}`
  }

  const PJ = JSON.stringify(pj, null, 2) + '\n'
  const PJPATH = `${pkg}/package.json`

  if (interactive) {
    console.log('About to write to %s:\n\n%s\n', PJPATH, PJ)
    const y = await PROMPT({
      prompt: 'Is this OK?',
      default: 'yes'
    })
    if (y !== 'yes' && y.toLowerCase().charAt(0) !== 'y') {
      console.log('Aborted.')
      process.exit()
    }
  }

  WRITE(PJPATH, PJ)
  if (interactive) {
    console.log('Saved package.json')
  } else {
    console.log('Wrote to %s:\n\n%s\n', PJPATH, PJ)
  }

  if (pj.license && !EXISTS(`${pkg}/LICENSE`)) {
    let data = READ(`${template}/LICENSE-${pj.license}`, 'utf8')
    if (data) {
      WRITE(`${pkg}/LICENSE`, data)
      console.log('Copied LICENSE')
    }
  }

  if (!EXISTS(`${pkg}/.gitignore`)) {
    WRITE(`${pkg}/.gitignore`, READ(`${template}/gitignore`))
    console.log('Copied .gitignore')
  }

  if (!EXISTS(`${pkg}/.travis.yml`)) {
    WRITE(`${pkg}/.travis.yml`, READ(`${template}/travis.yml`))
    console.log('Copied .travis.yml')
  }

  if (!EXISTS(`${pkg}/index.js`)) {
    WRITE(`${pkg}/index.js`, READ(`${template}/index.js`))
    console.log('Copied index.js')
  }

  if (!EXISTS(`${pkg}/test`)) MKDIR(`${pkg}/test`)
  if (!EXISTS(`${pkg}/test/test.js`)) {
    WRITE(`${pkg}/test/test.js`, READ(`${template}/test.js`))
    console.log('Copied test/test.js')
  }

  if (!EXISTS(`${pkg}/CODE_OF_CONDUCT.md`)) {
    WRITE(`${pkg}/CODE_OF_CONDUCT.md`, READ(`${template}/CODE_OF_CONDUCT.md`))
    console.log('Copied Code of Conduct')
  }

  if (!EXISTS(`${pkg}/README.md`)) {
    let readme = READ(`${template}/README.md`, 'utf8')
    readme = FILL(readme, pj)
    if (repo) {
      readme = FILL(readme, { repoPath: repo.path() })
    }
    WRITE(`${pkg}/README.md`, readme)
    console.log('Generated README')
  }

  if (pj.repository.type === 'git' && repo && !EXISTS(`${pkg}/.git`)) {
    console.log(B('\nSetting up project...'))
    const pwd = process.cwd()
    process.chdir(pkg)
    SYS(`git init`)
    SYS(`npm i`)
    SYS(`git add .`)
    SYS(`git reset index.js test/test.js`)
    SYS(`git commit -m "Initial commit" -m "Automatically generated by @delucis/create" > /dev/null`)
    SYS(`git branch -m master latest`)
    if (repo) {
      SYS(`git remote add origin https://github.com/${repo.path()}.git`)
      const reponame = pj.name.replace(/\W/g, '-').replace(/-+/g, '-').replace(/^-|-$/, '')
      SYS(`hub create -p -d "${pj.description}" -h ${pj.homepage} ${reponame}`)
      SYS(`git push -u origin latest`)
    }
    process.chdir(pwd)
  }
  console.log(B('\nDone.'))
}

/**
 * Make a string bold/bright with ANSI escape codes
 * @param  {String} s String to format
 * @return {String}   Formatted string
 */
const B = s => '\u001b[' + 1 + 'm' + s + '\u001b[' + 22 + 'm'

/**
 * Prompt user for input
 * @param  {Object} opts      Options passed to read module
 * @return {Promise<String>}  Promise for the user input string
 */
const PROMPT = opts => new Promise((resolve, reject) => {
  opts.prompt = B(opts.prompt)
  STDIN(opts, function (err, res, isDefault) {
    if (err) process.exit(1)
    if (res) resolve(res)
  })
})

/**
 * A very simple handlebars-y templating function that supports object props
 * @param  {String} template    The template string to fill with variables
 * @param  {Object} vars        The variables used to fill the template
 * @param  {String} [parent=''] Used internally for recursive calls
 * @return {String}             The template with {{var}} placeholders replaced
 */
const FILL = (template, vars, parent = '') => {
  return Object.keys(vars).reduce((template, key) => {
    const path = parent ? `${parent}.${key}` : key
    if (typeof vars[key] === 'object') {
      return FILL(template, vars[key], path)
    }
    return template.replace(RegExp(`{{${path}}}`, 'g'), vars[key])
  }, template)
}
