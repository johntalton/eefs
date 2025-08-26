import {
	Common,
	EEFS_FILESYS_MAGIC,
	FILE_ALLOCATION_TABLE_SIZE
} from '@johntalton/eefs'

export async function format(eeprom, baseAddress, byteSize) {
  console.log('FORMAT =================================', byteSize)
  return Common.writeHeader(eeprom, baseAddress, {
    CRC: 0,
    magic: EEFS_FILESYS_MAGIC,
    version: 1,
    freeMemoryOffset: baseAddress + FILE_ALLOCATION_TABLE_SIZE,
    freeMemorySize: byteSize - FILE_ALLOCATION_TABLE_SIZE,
    numberOfFiles: 0
  })
}
