import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
	EEFSFileSystemDirectoryHandle,
	EEFSFileSystemFileHandle,
	EEFSFileSystemWritableStream,
	EEFSStorageManager
} from '@johntalton/eefs/storage'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

import { Common } from '@johntalton/eefs'

const INIT_BUFFER = Uint8Array.from([
	0, 0, 0, 0, // crc
	0xee, 0xf5, 0x12, 0x34, // magic
	0, 0, 0, 1, // version
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0 // number of files
])

const SIMPLE_CONTENT = (new TextEncoder()).encode(JSON.stringify({
	name: 'bob',
	occupation: false,
	dob: null
}))
const SIMPLE_BUFFER = Uint8Array.from([
	0, 0, 0, 77, // crc
	0xee, 0xf5, 0x12, 0x34, // magic
	0, 0, 0, 1, // version
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 1, // number of files

	// fat
	0, 0, 0, 32, // file offset
	0, 0, 0, 0xff, // max size

//	...(new Array(63)),

	// file header
	0, 0, 0, 0, // crc
	0, 0, 0, 1, // inUse
	0, 0, 0, 0, // attributes
	0, 0, 0, SIMPLE_CONTENT.byteLength, // file size
	0, 0, 0, 0, // mod time
	0, 0, 0, 0, // create time
	...(new TextEncoder().encode('SIMPLE')),
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0, 0, 0,
	0, 0,     /// pad to 40
	...SIMPLE_CONTENT
])

const W_BUFFER_SIZE = 1024
const FREE_OFFSET =  (8 * 64) + 24
const FREE_SIZE = W_BUFFER_SIZE - FREE_OFFSET
const WRITABLE_BUFFER = Uint8Array.from([
	0, 0, 0, 77, // crc
	0xee, 0xf5, 0x12, 0x34, // magic
	0, 0, 0, 1, // version
	0, 0, (FREE_OFFSET >> 8), (FREE_OFFSET & 0xFF), // free offset
	0, 0, (FREE_SIZE >> 8), (FREE_SIZE & 0xFF), // free size
	0, 0, 0, 0, // number of files

	// fat
	0, 0, 0, 0, // file offset
	0, 0, 0, 0, // max size
	...(new Array((8 * 64) - 8)), // pad out fat for EEFS_MAX_FILES

	...(new Array(FREE_SIZE)),
])


function mockEEPROM(buffer) {
	const copy = ArrayBuffer.isView(buffer) ? buffer.buffer.slice() : buffer.slice()
	return new EEPROMArrayBuffer(copy)
}

describe('Storage', () => {
	it('should init from', async () => {
		const eeprom = mockEEPROM(INIT_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})

		assert.ok(storage instanceof EEFSStorageManager)
	})

	it('should return root directory', async () => {
		const eeprom = mockEEPROM(INIT_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})

		const root = await storage.getDirectory()
		assert.ok(root instanceof EEFSFileSystemDirectoryHandle)
		assert.equal(root.name, '/')
		assert.equal(root.kind, 'directory')
	})

	it('should not return file handle that does not exist', async () => {
		const eeprom = mockEEPROM(INIT_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})

		const root = await storage.getDirectory()
		await assert.rejects(() => root.getFileHandle('README.md'))
	})

	it('should have empty iterator', async () => {
		const eeprom = mockEEPROM(INIT_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})

		const root = await storage.getDirectory()
		const listing = await Array.fromAsync(root.entries())

		assert.equal(listing.length, 0)
	})

	it('should have simple file', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()
		const file = await root.getFileHandle('SIMPLE')

		assert.ok(file instanceof EEFSFileSystemFileHandle)
		assert.equal(file.kind, 'file')
		assert.equal(file.name, 'SIMPLE')
	})

	it('should access simple file', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()
		const fh = await root.getFileHandle('SIMPLE')
		const file = await fh.getFile()

		assert.ok(file instanceof File)
		assert.equal(file.size, 44)

		const text = await file.text()
		assert.equal(text.length, 44)
		const content = JSON.parse(text)
		assert.equal(content.name, 'bob')
		assert.equal(content.occupation, false)
	})

	it('should access simple file with create true', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()
		const fh = await root.getFileHandle('SIMPLE', { create: true })
		const file = await fh.getFile()

		assert.ok(file instanceof File)
		assert.equal(file.size, 44)
	})

	it('should list entires', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const listing = await Array.fromAsync(root.entries())
		assert.equal(listing.length, 1)
		const [ first ] = listing
		assert.ok(first instanceof Array)
		assert.equal(first.length, 2)
		assert.equal(first[0], 'SIMPLE')
		assert.ok(first[1] instanceof EEFSFileSystemFileHandle)
		assert.equal(first[1].kind, 'file')
		assert.equal(first[1].name, 'SIMPLE')
	})

	it('should list keys', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const listing = await Array.fromAsync(root.keys())
		assert.equal(listing.length, 1)
		const [ first ] = listing
		assert.equal(first, 'SIMPLE')
	})

	it('should list values', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const listing = await Array.fromAsync(root.values())
		assert.equal(listing.length, 1)
		const [ first ] = listing
		assert.ok(first instanceof EEFSFileSystemFileHandle)
		assert.equal(first.kind, 'file')
		assert.equal(first.name, 'SIMPLE')
	})

	it('should create new file handle with create true', async () => {
		const eeprom = mockEEPROM(WRITABLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const handle = await root.getFileHandle('NewFile.json', { create: true })
		assert.ok(handle instanceof EEFSFileSystemFileHandle)
	})

	it('should create writer for new file', async () => {
		const eeprom = mockEEPROM(WRITABLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const handle = await root.getFileHandle('NewFile.json', { create: true })
		const writable = await handle.createWritable({ keepExistingData: true })
		assert.ok(writable instanceof WritableStream)
		assert.ok(writable instanceof EEFSFileSystemWritableStream)
	})

	it('should write new file (direct write of string)', async () => {
		assert.equal(WRITABLE_BUFFER.byteLength, 1024)
		const eeprom = mockEEPROM(WRITABLE_BUFFER)
		// await Common.format(eeprom, 0, 1024)

		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()
		const handle = await root.getFileHandle('NewFile.json', { create: true })
		const writable = await handle.createWritable({ keepExistingData: true })
		assert.ok(writable instanceof EEFSFileSystemWritableStream)

		await writable.write(JSON.stringify({
			name: 'Joe',
			color: 'olive',
			age: 42
		}))

		const dv = new DataView(eeprom.buffer)
		const littleEndian = false

		const fatFileOffset = dv.getUint32(24, littleEndian)
		assert.equal(fatFileOffset, 24 + (64 * 8))
	})

	it('should write new file (getWriter)', async () => {
		assert.equal(WRITABLE_BUFFER.byteLength, 1024)
		const eeprom = mockEEPROM(WRITABLE_BUFFER)
		// await Common.format(eeprom, 0, 1024)

		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()
		const handle = await root.getFileHandle('NewFile.json', { create: true })
		const writable = await handle.createWritable({ keepExistingData: true })
		assert.ok(writable instanceof WritableStream)

		const content = (new TextEncoder()).encode(JSON.stringify({
			name: 'Sam',
			pocket: [ 'ring', 'bread' ]
		}))

		const first = content.subarray(0, 10)
		const last = content.subarray(10)

		const writer = writable.getWriter()
		await writer.ready
		await writer.write(first)
		await writer.write(last)
		writer.releaseLock()

		await writable.close()


		const dv = new DataView(eeprom.buffer)
		const littleEndian = false

		const fatFileOffset = dv.getUint32(24, littleEndian)
		assert.equal(fatFileOffset, 24 + (64 * 8))


		const file = await handle.getFile()
		assert.equal(file.size, content.byteLength)
		assert.equal(file.name, 'NewFile.json')

		const readBackContent = await file.text()
		assert.ok(readBackContent.startsWith('{'))
		const json = JSON.parse(readBackContent)
		assert.equal(json.pocket[0], 'ring')

		var count = 0
		for await (const [ filename ] of root) {
			count += 1
			assert.equal(filename, 'NewFile.json')
		}
		assert.equal(count, 1)

	})

	it('should not resolve name if not same storage manager', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const storageOther = await EEFSStorageManager.from(eeprom, {})
		const rootOther = await storageOther.getDirectory()

		const relativePaths = await root.resolve(rootOther)
		assert.equal(relativePaths, null)

	})

	it('should resolve self', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const relativePaths = await root.resolve(root)

		assert.ok(relativePaths !== null)
		assert.equal(relativePaths.length, 1)
	})

	it('should resolve file name of decedent', async () => {
		const eeprom = mockEEPROM(SIMPLE_BUFFER)
		const storage = await EEFSStorageManager.from(eeprom, {})
		const root = await storage.getDirectory()

		const handle = await root.getFileHandle('SIMPLE')
		const relativePaths = await root.resolve(handle)

		assert.ok(relativePaths !== null)
		assert.equal(relativePaths.length, 1)
		assert.equal(relativePaths[0], 'SIMPLE')
	})

})

