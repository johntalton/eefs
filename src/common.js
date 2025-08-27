import {
	EEFS_FILESYSTEM_MAGIC,
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
 *  InodeTable,
 *  InodeIndex,
 *  FileAllocationTableEntry,
 *  FileHeader
 * } from './types.js'
 */


/**
 * @param {EEPROM} eeprom
 * @param {number} baseAddress
 * @param {number} byteSize
 * @param {number} [version=1]
 */
export async function format(eeprom, baseAddress, byteSize, version = 1) {
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
	 * @param {number} baseAddress
	 * @returns {Promise<Header>}
	 */
	static async readHeader(eeprom, baseAddress) {
		const ab = await eeprom.read(baseAddress, FILE_ALLOCATION_TABLE_HEADER_SIZE)
		if(ab.byteLength < FILE_ALLOCATION_TABLE_HEADER_SIZE) { throw new Error('under size header') }

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
	 * @param {InodeTable} inodeTable
	 * @param {InodeIndex} inodeIndex
	 * @returns {Promise<FileAllocationTableEntry>}
	 */
	static async readFATEntry(eeprom, inodeTable, inodeIndex) {
		const offset = inodeTable.baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const ab = await eeprom.read(offset, FILE_ALLOCATION_TABLE_ENTRY_SIZE)
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
	 * @param {InodeTable} inodeTable
	 * @param {InodeIndex} inodeIndex
	 * @param {FileAllocationTableEntry} fatEntry
	 * @returns {Promise}
	 */
	static async writeFATEntry(eeprom, inodeTable, inodeIndex, fatEntry) {
		const offset = inodeTable.baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
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

		const filenameBufferU8 = encoder.encode(fileHeader.filename)
		const fileHeaderBufferU8 = new Uint8Array(fileHeaderBuffer, dv.byteOffset + 24, EEFS_MAX_FILENAME_SIZE)
		fileHeaderBufferU8.set(filenameBufferU8)

		return eeprom.write(offset, fileHeaderBuffer)
	}


	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {number} length
	 * @param {AllowSharedBufferSource} target
	 */
	static async readData(eeprom, offset, length, target) {
		const ab = await eeprom.read(offset, length, target)

		// const targetU8 = ArrayBuffer.isView(target) ?
		// 	new Uint8Array(target.buffer, target.byteOffset, target.byteLength) :
		// 	new Uint8Array(target, 0, target.byteLength)

		// const u8 = ArrayBuffer.isView(ab) ?
		// 	new Uint8Array(ab.buffer, ab.byteOffset, ab.byteLength) :
		// 	new Uint8Array(ab, 0, ab.byteLength)

		// targetU8.set(u8)

		return ab
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {AllowSharedBufferSource} buffer
	 * @param {number} length
	 */
	static async writeData(eeprom, offset, length, buffer) {
		// todo respect length
		return eeprom.write(offset, buffer)
	}
}

