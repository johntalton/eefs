# NASA EEFS

Implementation of [NASA EEFS](https://github.com/nasa/eefs).

# Example

```javascript
// create a mock 32K eeprom
const ab = new ArrayBuffer(32 * 1024 / 8)
const eeprom = new EEPROMArrayBuffer(ab)

```

# License

The original [EEFS](https://github.com/nasa/eefs) states that is licensed under [NASA Open Source Agreement](https://en.wikipedia.org/wiki/NASA_Open_Source_Agreement).  However, all references to an official `.gov` site are absent from the web

This implementation is a whole cloth original creation of the open sourced code base.