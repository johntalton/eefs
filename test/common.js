import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	Common,
	FILE_ALLOCATION_TABLE_ENTRY_SIZE,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_HEADER_SIZE,
	format
} from '@johntalton/eefs'

describe('format', () => {
	it('should reject if buffer is not minimum size', async () => {
		const eeprom = {
			async read(offset, length, into) { return new ArrayBuffer(0) },
			async write(offset, buffer) {}
		}

		const baseAddress = 0
		const byteSize = 16
		await assert.rejects(async () => await format(eeprom, baseAddress, byteSize))
	})
})

describe('Common', () => {
	describe('readHeader', () => {
		it('should reject empty buffers ', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(0) },
				async write(offset, buffer) {}
			}

			const baseAddress = 0
			await assert.rejects(() => Common.readHeader(eeprom, baseAddress), RangeError)
		})

		it('should reject small buffers ', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(8) },
				async write(offset, buffer) {}
			}

			const baseAddress = 0
			await assert.rejects(() => Common.readHeader(eeprom, baseAddress), RangeError)
		})

		it('should read zeroed ArrayBuffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(FILE_ALLOCATION_TABLE_HEADER_SIZE) },
				async write(offset, buffer) {}
			}

			const baseAddress = 0
			const header = await Common.readHeader(eeprom, baseAddress)
			assert.ok(header !== undefined)
			assert.equal(header.CRC, 0)
			assert.equal(header.magic, 0)
			assert.equal(header.version, 0)
			assert.equal(header.freeMemoryOffset, 0)
			assert.equal(header.freeMemorySize, 0)
			assert.equal(header.numberOfFiles, 0)
		})

		it('should read values from ArrayBuffer', async () => {
			const eeprom = {
				async read(offset, length, into) {
					const u32 = Uint32Array.from([
						// 1..6 in little-endian
						0x01_00_00_00,
						0x02_00_00_00,
						0x03_00_00_00,
						0x04_00_00_00,
						0x05_00_00_00,
						0x06_00_00_00,
					])
					return u32.buffer
				},
				async write(offset, buffer) {}
			}

			const baseAddress = 0
			const header = await Common.readHeader(eeprom, baseAddress)
			assert.ok(header !== undefined)
			assert.equal(header.CRC, 1)
			assert.equal(header.magic, 2)
			assert.equal(header.version, 3)
			assert.equal(header.freeMemoryOffset, 4)
			assert.equal(header.freeMemorySize, 5)
			assert.equal(header.numberOfFiles, 6)
		})
	})

	describe('writeHeader', () => {
		it('should ', async () => {})
	})

	describe('readFATEntry', () => {
		it('should reject empty buffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(0) },
				async write(offset, buffer) {}
			}

			const offset = 0
			await assert.rejects(() => Common.readFATEntry(eeprom, offset), RangeError)
		})

		it('should reject small buffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(1) },
				async write(offset, buffer) {}
			}

			const offset = 0
			await assert.rejects(() => Common.readFATEntry(eeprom, offset), RangeError)
		})

		it('should read zeroed ArrayBuffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(FILE_ALLOCATION_TABLE_ENTRY_SIZE) },
				async write(offset, buffer) {}
			}

			const offset = 0
			const fatEntry = await Common.readFATEntry(eeprom, offset)
			assert.equal(fatEntry.fileHeaderOffset, 0)
			assert.equal(fatEntry.maxFileSize, 0)
		})
	})

	describe('writeFATEntry', () => {
		it('should ', async () => {})
	})

	describe('readFileHeader', () => {
		it('should reject empty buffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(0) },
				async write(offset, buffer) {}
			}

			const decoder = new TextDecoder('utf-8')
			const offset = 0
			await assert.rejects(() => Common.readFileHeader(eeprom, decoder, offset), RangeError)
		})

		it('should read zeroed ArrayBuffer', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(FILE_HEADER_SIZE) },
				async write(offset, buffer) {}
			}

			const decoder = new TextDecoder('utf-8')
			const offset = 0
			const fileHeader = await Common.readFileHeader(eeprom, decoder, offset)
			assert.equal(fileHeader.CRC, 0)
			assert.equal(fileHeader.inUse, false)
			assert.equal(fileHeader.attributes, 0)
			assert.equal(fileHeader.fileSize, 0)
			assert.equal(fileHeader.modificationDate, 0)
			assert.equal(fileHeader.creationDate, 0)
			assert.equal(fileHeader.filename, '')
		})

		it('should read custom with TextDecoder utf-16be with BOM', async () => {
			const ab = new ArrayBuffer(FILE_HEADER_SIZE)
			const u8 = new Uint8Array(ab, 24)
			u8.set([
				0xFE, 0xFF,  // BOM big-endian
				0xd8, 0x3d,
				0xdc, 0x69,
				0xd8, 0x3c,
				0xdf, 0xfb,
				0x20, 0x0d,
				0x27, 0x64,
				0xfe, 0x0f,
				0x20, 0x0d,
				0xd8, 0x3d,
				0xdc, 0x8b,
				0x20, 0x0d,
				0xd8, 0x3d,
				0xdc, 0x69,
				0xd8, 0x3c,
				0xdf, 0xfc,
				0, 0, 0, 0, 0, 0, 0, 0
			])

			const eeprom = {
				async read(offset, length, into) { return ab },
				async write(offset, buffer) {}
			}

			const decoder = new TextDecoder('utf-16be', { fatal: true, ignoreBOM: false })
			const offset = 0
			const fileHeader = await Common.readFileHeader(eeprom, decoder, offset)

			assert.equal(fileHeader.filename, '👩🏻‍❤️‍💋‍👩🏼')
		})

		it('should reject bad data with custom TextDecoder with fatal True', async () => {
			const ab = new ArrayBuffer(FILE_HEADER_SIZE)
			const u8 = new Uint8Array(ab, 24)
			u8.set([
				0xFE, 0xFF,  // BOM big-endians
				0xff, 0      // trash
			])

			const eeprom = {
				async read(offset, length, into) { return ab },
				async write(offset, buffer) {}
			}

			const decoder = new TextDecoder('utf-16be', { fatal: true, ignoreBOM: true })
			const offset = 0
			await assert.rejects(() => Common.readFileHeader(eeprom, decoder, offset))
		})

		it('should read custom bad data with TextDecoder with fatal False', async () => {
			const ab = new ArrayBuffer(FILE_HEADER_SIZE)
			const u8 = new Uint8Array(ab, 24)
			u8.set([
				0xFE, 0xFF,  // BOM big-endians
				0xff, 0      // trash
			])

			const eeprom = {
				async read(offset, length, into) { return ab },
				async write(offset, buffer) {}
			}

			const decoder = new TextDecoder('utf-16be', { fatal: false, ignoreBOM: true })
			const offset = 0
			const fileHeader = await Common.readFileHeader(eeprom, decoder, offset)

			assert.equal(fileHeader.filename.length, 2)
			assert.equal(fileHeader.filename.charCodeAt(0), 0xfeff)
			assert.equal(fileHeader.filename.charCodeAt(1), 0xfffd)
		})
	})

	describe('writeFileHeader', () => {
		it('should write with inUse false', async () => {
			const eeprom = {
				async read(offset, length, into) { return new ArrayBuffer(0) },
				async write(offset, buffer) { }
			}

			const encoder = new TextEncoder()
			const offset = 0
			const fileHeader = {
				CRC: 0,
				inUse: false,
				attributes: 0,
				fileSize: 42,
				modificationDate: 0,
				creationDate: 0,
				filename: 'just a test'
			}
			Common.writeFileHeader(eeprom, encoder, offset, fileHeader)
		})
	})

	describe('readData', () => {
		it('should ', async () => {})
	})

	describe('writeData', () => {
		it('should ', async () => {})
	})

})