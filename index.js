const FS = require('fs')
const PATH = require('path')
const QX = require('@perl/qx').sync
const SYS = require('@perl/system').sync
const GITINFO = require('hosted-git-info')
const STDIN = require('read')
const CP = require('cp-file')
const READ = FS.readFileSync
const WRITE = FS.writeFileSync
const EXISTS = FS.existsSync

/**
 * Run the package initialisation flow
 * @param  {String}  pkg                Path to the package being initialised
 * @param  {String}  template           Path to the initialiser’s template dir
 * @param  {Object}  o                    Options
 * @param  {String}  o.github             Github username for package author/org
 * @param  {Array}   [o.namespaces=[]]    Any npm scopes used by the author
 * @param  {Boolean} [o.interactive=true] Should the initialiser ask for input?
 * @return {Promise}
 */
module.exports = async (pkg, template, { github, namespaces, interactive = true } = {}) => {
  LOG(`Setting up project with @delucis’s defaults...\n`)
  console.log(`  Press ^C at any time to quit.\n`)

  let pj = {}
  try { pj = JSON.parse(READ(`${pkg}/package.json`)) } catch (_) {}
  let tj = {}
  try { tj = JSON.parse(READ(`${template}/package.json`)) } catch (_) {}

  pj = await UPDATE_PJ(pj, tj, pkg, { github, namespaces, interactive })

  await WRITE_PJ(pj, pkg, { interactive })

  let copyTasks = []
  if (pj.license) {
    copyTasks.push(COPY(`LICENSE-${pj.license}`, pkg, template, { dest: 'LICENSE' }))
  }
  await Promise.all([
    ...copyTasks,
    COPY('gitignore', pkg, template, { addDot: true }),
    COPY('travis.yml', pkg, template, { addDot: true }),
    COPY('index.js', pkg, template),
    COPY('test.js', pkg, template, { dest: 'test/test.js' }),
    COPY('CODE_OF_CONDUCT.md', pkg, template, { msg: 'Copied Code of Conduct' })
  ])

  if (!EXISTS(`${pkg}/README.md`)) {
    let readme = MAKE_README(pj, template)
    WRITE(`${pkg}/README.md`, readme)
    console.log('  Generated README')
  }

  GITINIT(pj, pkg)
  console.log()
  LOG('Done.')
}

/**
 * Make a string bold/bright with ANSI escape codes
 * @param  {String} s String to format
 * @return {String}   Formatted string
 */
const B = s => '\u001b[' + 1 + 'm' + s + '\u001b[' + 22 + 'm'

/**
 * Make a string blue with ANSI escape codes
 * @param  {String} s String to format
 * @return {String}   Formatted string
 */
const BLUE = s => '\u001b[' + 34 + 'm' + s + '\u001b[39m'

/**
 * Log a string with some simple visual highlighting
 * @param {String} s String to log
 */
const LOG = s => console.log(B(BLUE('▶︎ ') + s))

/**
 * Prompt user for input
 * @param  {Object} opts      Options passed to read module
 * @return {Promise<String>}  Promise for the user input string
 */
const PROMPT = opts => new Promise((resolve, reject) => {
  opts.prompt = B(BLUE('▶︎ ') + opts.prompt)
  STDIN(opts, function (err, res, isDefault) {
    if (err) process.exit(1)
    if (res) resolve(res)
  })
})

/**
 * Copy a template file to the new project
 * @param  {String}  src              File name for source to copy
 * @param  {String}  pkg              Directory of new project
 * @param  {String}  template         Directory containing template files
 * @param  {Object}  o                Options object
 * @param  {String}  [o.dest]         File name to save to if different from src
 * @param  {Boolean} [o.addDot=false] Should the file name be prefixed with “.”?
 * @param  {String}  [o.msg]          Custom message to show on copy completion
 * @return {Promise}
 */
const COPY = async (src, pkg, template, { dest, addDot = false, msg } = {}) => {
  dest = `${addDot ? '.' : ''}${dest || src}`
  const copyTo = `${pkg}/${dest}`
  return CP(`${template}/${src}`, copyTo, { overwrite: false })
    .then(() => { console.log('  ' + (msg || `Copied “${dest}”`)) })
}

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

/**
 * Generate a simple README from package.json
 * @param  {Object} pj       Object representing contents of package.json
 * @param  {String} template String indicating template directory
 * @return {String}          README string
 */
const MAKE_README = (pj, template) => {
  let readme = READ(`${template}/README.md`, 'utf8')
  readme = FILL(readme, pj)
  let repo
  if (pj.repository.url) repo = GETREPO(pj.repository.url)
  if (repo) {
    readme = FILL(readme, { repoPath: repo.path() })
  }
  return readme
}

/**
 * Get a repository object from a URL using hosted-git-info, caching requests
 * @param  {String} url URL for the repository
 * @return {Object}     hosted-git-info repository object
 */
const GETREPO = url => {
  if (this[url]) return this[url]
  this[url] = GITINFO.fromUrl(url)
  return this[url]
}

/**
 * Update a package.json object
 * @param  {Object}  pj                   Contents of package.json
 * @param  {Object}  tj                   Contents of package.json defaults
 * @param  {String}  pkg                  Directory of package being set up
 * @param  {Object}  o                    Options
 * @param  {String}  o.github             GitHub username for package author
 * @param  {Array}   [o.namespaces=[]]    Potential scopes used on npm by author
 * @param  {Boolean} [o.interactive=true] Should we ask for user input?
 * @return {Promise<Object>}              Updated contents of package.json
 */
const UPDATE_PJ = async (pj, tj, pkg, { github, namespaces = [], interactive = true } = {}) => {
  namespaces = namespaces.join('|')

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
    pj.description = '🆕'
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
  if (pj.repository.url) {
    let repo = GETREPO(pj.repository.url)
    if (!pj.bugs) pj.bugs = repo.bugs()
    if (!pj.homepage) pj.homepage = `https://npmjs.com/package/${pj.name}`
  }

  return pj
}

/**
 * Write new package.json with optional prompts
 * @param  {Object}  pj             Contents of package.json
 * @param  {String}  pkg            Directory of package being set up
 * @param  {Boolean} [interactive]  Should we prompt to confirm package.json?
 * @return {Promise}
 */
const WRITE_PJ = async (pj, pkg, { interactive }) => {
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
    console.log('  Saved package.json')
  } else {
    console.log('  Wrote to %s:\n\n%s\n', PJPATH, PJ)
  }
}

/**
 * Initialse the project as a git repository and configure for GitHub
 * @param {Object} pj  Contents of package.json
 * @param {String} pkg Directory of package being set up
 */
const GITINIT = (pj, pkg) => {
  let repo
  if (pj.repository.url) repo = GETREPO(pj.repository.url)
  if (pj.repository.type === 'git' && repo && !EXISTS(`${pkg}/.git`)) {
    console.log()
    LOG(B('Setting up project...'))
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
    TRAVIS_ADD_TOKEN(repo)
    process.chdir(pwd)
  }
}

/**
 * Try to retrieve a GitHub { username, password } object from credentials
 * stored in OS X’s keychain
 * @return {Object|null}
 */
const GH_CREDENTIALS = () => {
  const credentials = QX`((echo -e "protocol=https\nhost=github.com\n" && cat) | git credential-osxkeychain get) <<< "\n"`
  const credentialRE = /^password=(.+)\nusername=([\w_-]+)$/
  const parsed = credentials.match(credentialRE)
  if (parsed) {
    const [, password, username] = parsed
    return { username, password }
  }
  return null
}

/**
 * Make a request to the GitHub REST API
 * @param {String}  endpoint  The endpoint to request, e.g. 'user'
 * @param {Object}  [data]    Data to pass as form content with the request
 * @param {String}  [verb]    The HTTP verb to use, e.g. 'PATCH' or 'DELETE'
 */
const GH_API = (endpoint, data, verb) => {
  const cred = GH_CREDENTIALS()
  let userArg = 'delucis'
  if (cred) userArg = `${cred.username}:${cred.password}`
  let dataArg = ''
  if (data) dataArg = `-d '${JSON.stringify(data)}' `
  let verbArg = ''
  if (verb) verbArg = `--request ${verb} `
  return JSON.parse(QX`curl -sS -u ${userArg} ${dataArg}${verbArg}https://api.github.com/${endpoint}`)
}

/**
 * Get a GitHub access token and add it to the Travis config file
 * @param {Object} repo Repository object from hosted-git-info
 */
const TRAVIS_ADD_TOKEN = (repo) => {
  try {
    let { token } = GH_API('authorizations', {
      scopes: ['public_repo'],
      note: `${repo.project} Greenkeeper lockfile`
    })
    SYS(`travis encrypt GH_TOKEN=${token} --add --no-interactive -r ${repo.path()}`)
    LOG('Added encrypted GitHub access token to Travis-CI config')
    SYS(`git add .travis.yml`)
    SYS(`git commit -m "ci(Travis): Add GitHub access token to config" -m "Automatically generated by @delucis/create" > /dev/null`)
    SYS(`git push`)
  } catch (e) {
    console.error(e)
  }
}
