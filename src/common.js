import {
	EEFS_FILESYSTEM_MAGIC,
	EEFS_FILESYSTEM_VERSION,
	EEFS_MAX_FILENAME_SIZE
} from './defs.js'

import {
	FILE_ALLOCATION_TABLE_ENTRY_SIZE,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_ALLOCATION_TABLE_SIZE,
	FILE_HEADER_SIZE,
	INUSE
} from './types.js'

import { stripZeroU8 } from './utils.js'

/**
 * @import {
 *  EEPROM,
 *  Header,
 *  FileAllocationTableEntry,
 *  FileHeader
 * } from './types.js'
 */


/**
 * @param {EEPROM} eeprom
 * @param {number} baseAddress
 * @param {number} byteSize
 * @param {number} [version = EEFS_FILESYSTEM_VERSION]
 */
export async function format(eeprom, baseAddress, byteSize, version = EEFS_FILESYSTEM_VERSION) {
	if(byteSize < FILE_ALLOCATION_TABLE_HEADER_SIZE) { throw new Error('size not adequate for fat header') }

  return Common.writeHeader(eeprom, baseAddress, {
    CRC: 0,
    magic: EEFS_FILESYSTEM_MAGIC,
    version,
    freeMemoryOffset: baseAddress + FILE_ALLOCATION_TABLE_SIZE,
    freeMemorySize: byteSize - FILE_ALLOCATION_TABLE_SIZE,
    numberOfFiles: 0
  })
}

export class Common {
	/**
	 * @param {EEPROM} eeprom
	 * @param {number} baseAddress
	 * @returns {Promise<Header>}
	 */
	static async readHeader(eeprom, baseAddress) {
		const ab = await eeprom.read(baseAddress, FILE_ALLOCATION_TABLE_HEADER_SIZE)
		if(ab.byteLength < FILE_ALLOCATION_TABLE_HEADER_SIZE) { throw new RangeError('read size not adequate for fat header') }

		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset, ab.byteLength) :
			new DataView(ab, 0, ab.byteLength)

		const littleEndian = false
		const CRC = dv.getUint32(0, littleEndian)
		const magic = dv.getUint32(4, littleEndian)
		const version = dv.getUint32(8, littleEndian)
		const freeMemoryOffset = dv.getUint32(12, littleEndian)
		const freeMemorySize = dv.getUint32(16, littleEndian)
		const numberOfFiles = dv.getUint32(20, littleEndian)

		return {
			CRC,
			magic,
			version,
			freeMemoryOffset,
			freeMemorySize,
			numberOfFiles
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 */
	static async writeHeader(eeprom, baseAddress, header) {
		const headerBuffer = new ArrayBuffer(FILE_ALLOCATION_TABLE_HEADER_SIZE)
		const dv = new DataView(headerBuffer)

		const littleEndian = false
		dv.setUint32(0, header.CRC, littleEndian)
		dv.setUint32(4, header.magic, littleEndian)
		dv.setUint32(8, header.version, littleEndian)
		dv.setUint32(12, header.freeMemoryOffset, littleEndian)
		dv.setUint32(16, header.freeMemorySize, littleEndian)
		dv.setUint32(20, header.numberOfFiles, littleEndian)

		return eeprom.write(baseAddress, headerBuffer)
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @returns {Promise<FileAllocationTableEntry>}
	 */
	static async readFATEntry(eeprom, offset) {
		const ab = await eeprom.read(offset, FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		if(ab.byteLength < FILE_ALLOCATION_TABLE_ENTRY_SIZE) { throw new RangeError('read size not adequate for fat entry') }

		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset, ab.byteLength) :
			new DataView(ab, 0, ab.byteLength)

		const littleEndian = false
		const fileHeaderOffset = dv.getUint32(0, littleEndian)
		const maxFileSize = dv.getUint32(4, littleEndian)

		return {
			fileHeaderOffset,
			maxFileSize
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {FileAllocationTableEntry} fatEntry
	 * @returns {Promise}
	 */
	static async writeFATEntry(eeprom, offset, fatEntry) {
		const ab = new ArrayBuffer(FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const dv = new DataView(ab)

		const littleEndian = false
		dv.setUint32(0, fatEntry.fileHeaderOffset, littleEndian)
		dv.setUint32(4, fatEntry.maxFileSize, littleEndian)

		return eeprom.write(offset, ab)
	}


	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @returns {Promise<FileHeader>}
	 */
	static async readFileHeader(eeprom, decoder, offset) {
		const ab = await eeprom.read(offset, FILE_HEADER_SIZE)
		if(ab.byteLength < FILE_HEADER_SIZE) { throw new RangeError('read size not adequate for file header') }

		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset, ab.byteLength) :
			new DataView(ab, 0, ab.byteLength)

		const littleEndian = false
		const CRC = dv.getUint32(0, littleEndian)
		const inUse = dv.getUint32(4, littleEndian)
		const attributes = dv.getUint32(8, littleEndian)
		const fileSize = dv.getUint32(12, littleEndian)

		const modificationDate = dv.getUint32(16, littleEndian)
		const creationDate = dv.getUint32(20, littleEndian)

		const filenameBuffer = stripZeroU8(new Uint8Array(dv.buffer, dv.byteOffset + 24, EEFS_MAX_FILENAME_SIZE))
		const filename = decoder.decode(filenameBuffer)

		return {
			CRC,
			inUse: inUse === INUSE.TRUE,
			attributes,
			fileSize,
			modificationDate,
			creationDate,
			filename
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {TextEncoder} encoder
	 * @param {number} offset
	 * @param {FileHeader} fileHeader
	 */
	static async writeFileHeader(eeprom, encoder, offset, fileHeader) {
		const fileHeaderBuffer = new ArrayBuffer(FILE_HEADER_SIZE)
		const dv = new DataView(fileHeaderBuffer)

		const littleEndian = false
		dv.setUint32(0, fileHeader.CRC, littleEndian)
		dv.setUint32(4, fileHeader.inUse ? INUSE.TRUE : INUSE.FALSE, littleEndian)
		dv.setUint32(8, fileHeader.attributes, littleEndian)
		dv.setUint32(12, fileHeader.fileSize, littleEndian)
		dv.setUint32(16, fileHeader.modificationDate, littleEndian)
		dv.setUint32(20, fileHeader.creationDate, littleEndian)

		const fileHeaderBufferU8 = new Uint8Array(fileHeaderBuffer, dv.byteOffset + 24, EEFS_MAX_FILENAME_SIZE)
		encoder.encodeInto(fileHeader.filename, fileHeaderBufferU8)

		return eeprom.write(offset, fileHeaderBuffer)
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {number} length
	 * @param {AllowSharedBufferSource} target
	 */
	static async readData(eeprom, offset, length, target) {
		return eeprom.read(offset, length, target)
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {AllowSharedBufferSource} buffer
	 * @param {number} length
	 */
	static async writeData(eeprom, offset, length, buffer) {
		// todo respect length
		if(buffer.byteLength !== length) { throw new Error('length miss-match') }
		return eeprom.write(offset, buffer)
	}
}

