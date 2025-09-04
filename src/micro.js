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
	 * @param {TextDecoder} [customDecoder]
	 * @param {undefined} [customCollator]
	 * @returns {Promise<File|undefined>}
	 */
	static async findFile(eeprom, baseAddress, filename, customDecoder = undefined, customCollator = undefined) {
		const decoder = customDecoder ?? new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
		const collator = customCollator ?? new Intl.Collator()

		const header = await Common.readHeader(eeprom, baseAddress)
		if(header.magic !== EEFS_FILESYSTEM_MAGIC) { throw new Error('Invalid Magic') }
		if(header.version !== EEFS_FILESYSTEM_VERSION) { throw new Error('Invalid Version') }

		for(const inodeIndex of range(0, header.numberOfFiles - 1)) {
			const fatEntryOffset = baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
			const fatEntry = await Common.readFATEntry(eeprom, fatEntryOffset)

			const fileHeaderOffset = baseAddress + fatEntry.fileHeaderOffset
			const fileHeader = await Common.readFileHeader(eeprom, decoder, fileHeaderOffset)

			if(fileHeader.inUse && (collator.compare(fileHeader.filename, filename) === 0)) {
				const dataOffset = fileHeaderOffset + FILE_HEADER_SIZE
				const target = new ArrayBuffer(fileHeader.fileSize)
				const data = await Common.readData(eeprom, dataOffset, fileHeader.fileSize, target)

				return new File([ data ], fileHeader.filename, { type: 'application/octet-stream', lastModified: fileHeader.modificationDate * 1000 })
			}
		}

		return undefined
	}
}
