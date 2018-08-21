# @delucis/create

[![Greenkeeper badge](https://badges.greenkeeper.io/delucis/delucis-create.svg)](https://greenkeeper.io/)

Initialise a new NPM project using @delucis’s defaults

```
npm init @delucis
```

## Includes

- Tooling
  - [StandardJS](https://standardjs.com/) for code style linting
  - [AVA](https://github.com/avajs/ava) unit testing
  - Test coverage with [`nyc`](https://github.com/istanbuljs/nyc) and [Coveralls](https://coveralls.io/)
  - [Travis-CI](https://travis-ci.com/) configured to use Coveralls and [Greenkeeper](https://greenkeeper.io/) 
  - Version release flow with `npm run release`, using [`standard-version`](https://github.com/conventional-changelog/standard-version)
  - Use conventional commits with [`commitizen`](http://commitizen.github.io/cz-cli/) (install globally for ease of running `git cz`)
  - `.gitignore` for Node
- Community
  - GPL v3 License
  - [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/)
- Set-up
  - Generates `package.json` and a simple `README` for you
  - Creates a new private GitHub repo and pushes the initial commit

## Credits

Inspired by [@iarna/create](https://github.com/iarna/iarna-create/)
