import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	Common,
	FILE_ALLOCATION_TABLE_ENTRY_SIZE,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_HEADER_SIZE
} from '@johntalton/eefs'

describe('format', () => {

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
	})

	describe('writeFileHeader', () => {
		it('should ', async () => {})
	})

	describe('readData', () => {
		it('should ', async () => {})
	})

	describe('writeData', () => {
		it('should ', async () => {})
	})

})