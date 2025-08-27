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

The original [EEFS](https://github.com/nasa/eefs) states that is licensed under [NASA Open Source Agreement](https://opensource.org/license/nasa1-3-php) and on [Wikipedia](https://en.wikipedia.org/wiki/NASA_Open_Source_Agreement).


A listing can be found on [NASA Site](https://code.nasa.gov/)

Reference number: [GSC-16852-1](https://software.nasa.gov/software/GSC-16852-1)

This implementation is a whole cloth original creation inspired by the open sourced code base.

Original license as follows:

```
 Copyright (c) 2010-2014, United States government as represented by the
 administrator of the National Aeronautics Space Administration.
 All rights reserved. This software was created at NASAs Goddard
 Space Flight Center pursuant to government contracts.

 This is governed by the NASA Open Source Agreement and may be used,
 distributed and modified only pursuant to the terms of that agreement.
```