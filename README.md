# EEFS (eeprom file system)

[![npm Version](http://img.shields.io/npm/v/@johntalton/eefs.svg)](https://www.npmjs.com/package/@johntalton/eefs)
![GitHub package.json version](https://img.shields.io/github/package-json/v/johntalton/eefs)
![CI](https://github.com/johntalton/eefs/workflows/CI/badge.svg)
![GitHub](https://img.shields.io/github/license/johntalton/eefs)


Implementation of [NASA EEFS](https://github.com/nasa/eefs).

# Example

```javascript
import {
  EEFS,
  EEFS_SUCCESS,
  O_CREAT, O_WRONLY,
  EEFS_ATTRIBUTE_NONE
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

// create a mock 32K eeprom
const ab = new ArrayBuffer(32 * 1024 / 8)
const eeprom = new EEPROMArrayBuffer(ab)

const BASE_ADDRESS = 0
const filesystem = {
  ...DEFAULT_FILESYSTEM,
  eeprom
}

const initStatus = await EEFS.initFS(filesystem, BASE_ADDRESS)
if(initStatus !== EEFS_SUCCESS) { /* handle it */ }

const fd = await EEFS.open(filesystem, 'config.json', O_CREAT|O_WRONLY, EEFS_ATTRIBUTE_NONE)
if(fd < 0) { /* not ok */ }

// ... etc

```

# License

The original [EEFS](https://github.com/nasa/eefs) states that is licensed under [NASA Open Source Agreement](https://en.wikipedia.org/wiki/NASA_Open_Source_Agreement).  However, all references to an official `.gov` site are absent from the web

This implementation is a whole cloth original creation of the open sourced code base.