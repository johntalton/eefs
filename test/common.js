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
			assert.equal(0, header.CRC)
			assert.equal(0, header.magic)
			assert.equal(0, header.version)
			assert.equal(0, header.freeMemoryOffset)
			assert.equal(0, header.freeMemorySize)
			assert.equal(0, header.numberOfFiles)
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
			assert.equal(1, header.CRC)
			assert.equal(2, header.magic)
			assert.equal(3, header.version)
			assert.equal(4, header.freeMemoryOffset)
			assert.equal(5, header.freeMemorySize)
			assert.equal(6, header.numberOfFiles)
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
			assert.equal(0, fatEntry.fileHeaderOffset)
			assert.equal(0, fatEntry.maxFileSize)
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
			assert.equal(0, fileHeader.CRC)
			assert.equal(false, fileHeader.inUse)
			assert.equal(0, fileHeader.attributes)
			assert.equal(0, fileHeader.fileSize)
			assert.equal(0, fileHeader.modificationDate)
			assert.equal(0, fileHeader.creationDate)
			assert.equal('', fileHeader.filename)
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