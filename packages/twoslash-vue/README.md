# twoslash-vue

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

Extended TwoSlash for Vue SFC support.

> [!IMPORTANT]
> Working in Progress.

## Install

```bash
npm i twoslash-vue
```

## Usage

The function supercharges `twoslasher` function from `twoslash` to support the `vue` extension, while fallback to the original behavior for other extensions.

## TODOs

- [x] Support Vue SFC
- [ ] Support marker in Vue SFC (because the compile code no longer have the same position, we need a way to mark it back)
- [ ] Support markers in Vue Template (via html comment maybe?)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE) License © 2023-PRESENT [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/twoslash-vue?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/twoslash-vue
[npm-downloads-src]: https://img.shields.io/npm/dm/twoslash-vue?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/twoslash-vue
