# EEFS (eeprom file system)

Implementation of [NASA EEFS](https://github.com/nasa/eefs) for Browser and Node


[![npm Version](http://img.shields.io/npm/v/@johntalton/eefs.svg)](https://www.npmjs.com/package/@johntalton/eefs)
![GitHub package.json version](https://img.shields.io/github/package-json/v/johntalton/eefs)
![CI](https://github.com/johntalton/eefs/workflows/CI/badge.svg)
![GitHub](https://img.shields.io/github/license/johntalton/eefs)


# Usage

EEPROM file systems are best target for a write-once read many use case.

The example bellow shows writing to an offline `EEPROMArrayBuffer` implementation, which then can be copied in-full to the eeprom once files are generated and stored as-desired.

Using live [EEPROM](https://github.com/johntlaton/eeprom) device is also fully supported

# Example

```javascript
import {
  EEFS,
  EEFS_SUCCESS,
  O_CREAT, O_WRONLY
} from '@johntalton/eefs'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

// create a mock 32K eeprom
const ab = new ArrayBuffer(32 * 1024 / 8)
const eeprom = new EEPROMArrayBuffer(ab)

const BASE_ADDRESS = 0
const options = {
  eeprom
}

const handle = await EEFS.initFS(options, BASE_ADDRESS)
if(handle.status !== EEFS_SUCCESS) { /* handle it */ }

const fd = await EEFS.open(handle, 'config.json', O_CREAT|O_WRONLY)
if(fd < 0) { /* not ok */ }

// ... etc

// make sure to close 👍
await EEFS.close(handle, fd)


```

# Example with Custom TextDecoder / Collator

`initFS` can take in an `encoder` `decoder` and `collator` in order to process File Name.  The default is `utf-8` and `fatal` (which is common for most all cases).

However, if loading a filesystem that has been written with `utf-16be` (or other encodings) or there is a change of decoding issues (set `fatal` to false), the use of custom `decoder` can preserver what may be otherwise "invalid" file names.

This can also be useful when debugging a fs that may or may-not be in proper format.

Similarly, if a `collator` is passed in, it will be used to compare file names where function take in `filename` as a parameter.  This can be useful for supporting custom filenames etc.

```javascript
import { EEFS } from '@johntalton/eefs'
import { EEPROM } from '@johntalton/eeprom'

const eeprom = /* see EEPROM docs */

const options = {
  eeprom,
  encoder: new TextEncoder(),
  decoder: new TextDecoder('utf-16', { fatal: false, ignoreBOM: true })
  collator: Intl.Collator()
}

const handle = await EEFS.initFS(options, BASE_ADDRESS)
for await (const { filename } of EEFS.listInodes(handle)) {
  // note: because fatal is false, this be garbage-ish
  console.log('filename:', filename)
}

```

# Micro

The original source include a "micro" implementation that can be used to bypass most of the inode/fileDescriptor ceremony and directly access file.  While the use case is less interesting it is included here.

The `findFile` method take in similar parameter as `initFS` (including custom encoders etc) and returns a standard [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) implementation.

```javascript
import { MicroFS } from '@johntalton/eefs/micro'

const eeprom = /* form some place */
const baseAddress = 0
const file = await MicroEEFS.findFile(eeprom, baseAddress, 'boot.txt')
if(file === undefined) { /* handle it ⛔️ */ }

console.log('last modified', file.lastModified)

// always an octet stream as eefs has not mime concept
// file.type === 'application/octet-stream'

const u8 = await file.bytes()
/* process buffer */

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