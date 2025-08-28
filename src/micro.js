import { Common } from './common.js'
import { EEFS_FILESYSTEM_MAGIC, EEFS_FILESYSTEM_VERSION } from './defs.js'
import { FILE_ALLOCATION_TABLE_ENTRY_SIZE, FILE_ALLOCATION_TABLE_HEADER_SIZE, FILE_HEADER_SIZE } from './types.js'
import { range } from './utils.js'

/**
 * @import {
 *  EEPROM
 * } from './types.js'
 */

export class MicroEEFS {
	/**
	 * @param {EEPROM} eeprom
	 * @param {number} baseAddress
	 * @param {string} filename
	 * @param {TextDecoder} decoder
	 * @returns {Promise<File|undefined>}
	 */
	static async findFile(eeprom, baseAddress, filename, decoder) {
		const header = await Common.readHeader(eeprom, baseAddress)
		if(header.magic !== EEFS_FILESYSTEM_MAGIC) { throw new Error('EEFS_NO_SUCH_DEVICE') }
		if(header.version !== EEFS_FILESYSTEM_VERSION) { throw new Error('EEFS_NO_SUCH_DEVICE') }

		for(const inodeIndex of range(0, header.numberOfFiles - 1)) {
			const fatEntryOffset = baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
			const fatEntry = await Common.readFATEntry(eeprom, fatEntryOffset)

			const fileHeaderOffset = baseAddress + fatEntry.fileHeaderOffset
			const fileHeader = await Common.readFileHeader(eeprom, decoder, fileHeaderOffset)

			if(fileHeader.inUse && (fileHeader.filename === filename)) {
				const dataOffset = fileHeaderOffset + FILE_HEADER_SIZE
				const target = new ArrayBuffer(fileHeader.fileSize)
				const data = await Common.readData(eeprom, dataOffset, fileHeader.fileSize, target)

				return new File([ data ], fileHeader.filename, { type: 'application/octet-stream', lastModified: fileHeader.modificationDate * 1000 })
			}
		}

		return undefined
	}
}
